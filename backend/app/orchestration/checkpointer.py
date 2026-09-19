"""LangGraph checkpointer (conversation memory, thread_id = session_id): MemorySaver in dev, Postgres in prod.

The graph runs synchronously in a worker thread (see app/ws.py), so the durable store is the sync
`PostgresSaver` over a psycopg pool (roadmap §4 mentions AsyncPostgresSaver; same tables, same data), wrapped
in `WriteBehindSaver` so no turn ever waits on the database. If Postgres can't be reached at startup we log
it and fall back to memory: losing follow-up context beats losing voice control.
"""

from __future__ import annotations

import copy
import logging
import threading
from collections.abc import Iterator, Sequence
from typing import Any
from urllib.parse import quote, unquote

from langchain_core.runnables import RunnableConfig
from langgraph.checkpoint.base import (
    BaseCheckpointSaver,
    ChannelVersions,
    Checkpoint,
    CheckpointMetadata,
    CheckpointTuple,
)
from langgraph.checkpoint.memory import MemorySaver

from app.config import Settings

log = logging.getLogger("studyloop.checkpointer")

# created by PostgresSaver.setup() in `public`, which Supabase's Data API exposes to the (public) anon key
LANGGRAPH_TABLES = ("checkpoints", "checkpoint_blobs", "checkpoint_writes", "checkpoint_migrations")


def fix_database_url(url: str) -> str:
    """Percent-encode the password if it holds raw reserved characters (e.g. an unescaped '@', which would
    otherwise be read as the start of the host). Already-encoded URLs pass through unchanged."""
    scheme, sep, rest = url.partition("://")
    if not sep:
        return url
    userinfo, at, host_and_rest = rest.rpartition("@")  # the LAST '@' separates credentials from the host
    if not at or ":" not in userinfo:
        return url
    user, _, password = userinfo.partition(":")
    return f"{scheme}://{user}:{quote(unquote(password), safe='')}@{host_and_rest}"


def init_checkpointer(settings: Settings, timeout_s: float = 10.0) -> tuple[Any, str]:
    """(saver, description). Blocking: call from a thread at startup."""
    if settings.checkpointer != "postgres":
        return MemorySaver(), "memory"
    if not settings.database_url:
        log.warning("CHECKPOINTER=postgres but DATABASE_URL is empty; using memory")
        return MemorySaver(), "memory (no DATABASE_URL)"
    try:
        from langgraph.checkpoint.postgres import PostgresSaver
        from psycopg.rows import dict_row
        from psycopg_pool import ConnectionPool

        pool = ConnectionPool(
            fix_database_url(settings.database_url),
            min_size=1,
            max_size=4,
            # prepare_threshold=None: Supabase's poolers (Supavisor) don't support prepared statements
            kwargs={"autocommit": True, "prepare_threshold": None, "row_factory": dict_row},
            open=False,
        )
        pool.open(wait=True, timeout=timeout_s)
        saver = PostgresSaver(pool)
        saver.setup()
        with pool.connection() as conn:
            for table in LANGGRAPH_TABLES:
                # RLS on, no policies: invisible to anon/authenticated; the backend's owner role bypasses it
                conn.execute(f"alter table if exists public.{table} enable row level security")
        return WriteBehindSaver(MemorySaver(), saver), "postgres (write-behind)"
    except Exception as exc:  # unreachable host, bad credentials, missing driver
        log.warning("Postgres checkpointer unavailable (%s); using memory", type(exc).__name__)
        log.debug("checkpointer error detail", exc_info=True)
        return MemorySaver(), f"memory (postgres failed: {type(exc).__name__})"


class WriteBehindSaver(BaseCheckpointSaver):
    """Hot in-process checkpoints, durable copy in Postgres written behind the turn.

    LangGraph checkpoints after every graph step, synchronously. Against a remote Postgres that is a
    network round trip per step: measured ~1.9 s for a "pause" (budget: 150 ms server-side). So the graph
    reads and writes a MemorySaver, and one background thread persists only each session's *latest*
    checkpoint (intermediate steps coalesce away — about one write per turn). A session this process
    hasn't seen (e.g. after a restart or a Render spin-down) is loaded from Postgres once; the WebSocket
    `hello` prefetches it (`hydrate`) so the first command doesn't wait on the database either.
    """

    def __init__(self, hot: MemorySaver, cold: BaseCheckpointSaver, hydrate_wait_s: float = 3.0):
        super().__init__(serde=hot.serde)
        self.hot, self.cold = hot, cold
        self._hydrate_wait_s = hydrate_wait_s
        self._hydrating: dict[str, threading.Event] = {}
        self._pending: dict[str, tuple[Any, Any, Any, Any]] = {}
        self._cv = threading.Condition()
        self._closed = False
        self._busy = False
        self._worker = threading.Thread(target=self._write_loop, name="checkpoint-writer", daemon=True)
        self._worker.start()

    # -------------------------------------------------------------- reads
    def hydrate(self, thread_id: str) -> None:
        """Load a session's latest checkpoint from Postgres into memory, once per process."""
        with self._cv:
            event = self._hydrating.get(thread_id)
            if event is not None:
                owner = False
            else:
                event = self._hydrating[thread_id] = threading.Event()
                owner = True
        if not owner:
            event.wait(self._hydrate_wait_s)
            return
        try:
            base = {"configurable": {"thread_id": thread_id, "checkpoint_ns": ""}}
            if self.hot.get_tuple(base) is None and (t := self.cold.get_tuple(base)) is not None:
                parent = t.parent_config or base
                cfg = {"configurable": {"checkpoint_ns": "", **parent["configurable"]}}
                self.hot.put(cfg, t.checkpoint, t.metadata, dict(t.checkpoint["channel_versions"]))
                log.info("session %s: conversation memory restored from Postgres", thread_id)
        except Exception as exc:  # the conversation starts fresh; voice keeps working
            log.warning("session %s: could not load memory (%s)", thread_id, type(exc).__name__)
        finally:
            event.set()

    def get_tuple(self, config: RunnableConfig) -> CheckpointTuple | None:
        found = self.hot.get_tuple(config)
        if found is None and not config["configurable"].get("checkpoint_id"):
            self.hydrate(config["configurable"]["thread_id"])
            found = self.hot.get_tuple(config)
        return found

    def list(self, config: RunnableConfig | None, **kwargs: Any) -> Iterator[CheckpointTuple]:
        return self.hot.list(config, **kwargs)

    def get_next_version(self, current: Any, channel: Any) -> Any:
        return self.hot.get_next_version(current, channel)

    # -------------------------------------------------------------- writes
    def put(
        self,
        config: RunnableConfig,
        checkpoint: Checkpoint,
        metadata: CheckpointMetadata,
        new_versions: ChannelVersions,
    ) -> RunnableConfig:
        out = self.hot.put(config, checkpoint, metadata, new_versions)
        thread_id = config["configurable"]["thread_id"]
        with self._cv:
            # all channel versions, not just this step's: skipped intermediate steps may have changed others
            self._pending[thread_id] = (
                config,
                copy.deepcopy(checkpoint),
                copy.deepcopy(metadata),
                dict(checkpoint["channel_versions"]),
            )
            self._cv.notify()
        return out

    def put_writes(
        self, config: RunnableConfig, writes: Sequence[tuple[str, Any]], task_id: str, task_path: str = ""
    ) -> None:
        # pending writes only matter to resume an interrupted run; our turns always run to completion
        self.hot.put_writes(config, writes, task_id, task_path)

    def delete_thread(self, thread_id: str) -> None:
        self.hot.delete_thread(thread_id)
        with self._cv:
            self._pending.pop(thread_id, None)
        try:
            self.cold.delete_thread(thread_id)
        except Exception as exc:
            log.warning("could not delete session %s from Postgres (%s)", thread_id, type(exc).__name__)

    def _write_loop(self) -> None:
        while True:
            with self._cv:
                while not self._pending and not self._closed:
                    self._cv.wait()
                if not self._pending and self._closed:
                    return
                thread_id, item = next(iter(self._pending.items()))
                del self._pending[thread_id]
                self._busy = True
            try:
                self.cold.put(*item)
            except Exception as exc:
                log.warning("session %s: checkpoint not persisted (%s)", thread_id, type(exc).__name__)
            finally:
                with self._cv:
                    self._busy = False
                    self._cv.notify_all()

    def flush(self, timeout_s: float = 5.0) -> bool:
        """Wait until everything queued is in Postgres (shutdown, tests)."""
        with self._cv:
            return self._cv.wait_for(lambda: not self._pending and not self._busy, timeout=timeout_s)

    def close(self, timeout_s: float = 5.0) -> None:
        self.flush(timeout_s)
        with self._cv:
            self._closed = True
            self._cv.notify_all()
        self._worker.join(timeout_s)

import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import VideoPane from './VideoPane';
import AIAgentPanel from './AIAgentPanel';
import type { ChatMessage } from './QAChatTab';
import VoiceModal from './VoiceModal';
import VoiceCaption from './VoiceCaption';
import NoVideoState from './NoVideoState';
import Icon from '@/components/ui/AppIcon';
import { useTildePTT } from '@/hooks/useTildePTT';
import { useAppFullscreen } from '@/hooks/useAppFullscreen';
import { useYouTubePlayer } from '@/hooks/useYouTubePlayer';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import { useStudySocket, type Lang, type LangMode } from '@/hooks/useStudySocket';
import { readUiLang } from '@/lib/uiLang';
import { followUpContext } from '@/lib/followUps';
import { revisionSheetHtml, type RevisionQA } from '@/lib/revisionSheet';
import { printHtml } from '@/lib/notesExport';
import { pickOutline } from '@/lib/outline';
import { useVideoTranscript } from '@/hooks/useVideoTranscript';
import { useVideoNotes, type VideoNotesState } from '@/hooks/useVideoNotes';
import { useVideoOutline } from '@/hooks/useVideoOutline';
import { extractYouTubeId, IN_PROGRESS_STATUSES } from '@/services/transcriptService';
import { formatClock, parseClock } from '@/lib/time';
import {
  fetchChats,
  fetchResume,
  isConversation,
  resumeTarget,
  studyUrl,
  type ResumePoint,
} from '@/services/libraryService';
import { getSttProvider, hostedSttAvailable, setSttProvider, type SttProvider } from '@/services/speechService';
import { executePlayerAction, playerUnavailableMessage, resetSeekHistory } from '@/lib/playerActions';
import { captureSupported } from '@/lib/audioCapture';
import { hasVoiceFor } from '@/lib/tts';
import { setLastVideo } from '@/lib/lastVideo';
import { loadLocalPosition, pickMaxWatched, pickResumeSeconds, saveLocalPosition } from '@/lib/resumePosition';

const STT_OPTIONS: { id: SttProvider; label: string; toast: string }[] = [
  { id: 'sarvam', label: 'Sarvam', toast: 'Speech-to-text: Sarvam (Hindi/Hinglish model, uses Sarvam credit)' },
  { id: 'groq', label: 'Groq', toast: 'Speech-to-text: Groq Whisper (free; Sarvam only if Groq fails)' },
];

const HINDI_VOICE_NOTICE =
  'इस browser में हिंदी आवाज़ नहीं है। बोला हुआ हिंदी जवाब server की आवाज़ से आता है; वह न मिले तो जवाब सिर्फ़ text में दिखेगा।';

/**
 * Resolves which video to study: ?v=<id|url> → router state from the dashboard URL bar. There is deliberately no
 * fallback lecture: a missing or malformed link says so (and offers a paste field / the library) instead of
 * silently opening another video and adding it to the learner's library.
 */
export default function VideoStudyLayout() {
  const location = useLocation();
  const given = String(
    new URLSearchParams(location.search).get('v') || location.state?.videoUrl || location.state?.videoId || ''
  ).trim();
  const videoId = extractYouTubeId(given);
  if (!videoId) return <NoVideoState invalidValue={given || undefined} />;
  // key: a different video is a fresh player + fresh per-video state (a player stuck in error can't carry over)
  return <StudyView key={videoId} videoId={videoId} />;
}

function StudyView({ videoId }: { videoId: string }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [activeTimestamp, setActiveTimestamp] = useState('0:00');
  // The top-bar toggle: Auto (the default) answers in the language the learner uses, per turn, decided by the server;
  // EN / हिं force one. `language` is what the page itself speaks and shows: the forced one, or in Auto the language
  // of the last answer (so labels, chapters and the voice follow the conversation).
  const [langMode, setLangMode] = useState<LangMode>(() => {
    try {
      const v = localStorage.getItem('studyloop.langMode');
      return v === 'en' || v === 'hi' || v === 'auto' ? v : 'auto';
    } catch {
      return 'auto';
    }
  });
  // Auto starts in the language the app was last shown in (lib/uiLang's shared key, also set by the other pages)
  const [replyLang, setReplyLang] = useState<Lang>(readUiLang);
  const language: Lang = langMode === 'auto' ? replyLang : langMode;
  const noteReplyLanguage = useCallback((l?: Lang) => {
    if (l === 'en' || l === 'hi') setReplyLang(l);
  }, []);

  // anti-spoiler Q&A (on by default): off lets answers and summaries use the whole lecture
  const [spoilerGuard, setSpoilerGuard] = useState<boolean>(() => {
    try {
      return localStorage.getItem('studyloop.spoilerGuard') !== 'off';
    } catch {
      return true;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('studyloop.spoilerGuard', spoilerGuard ? 'on' : 'off');
    } catch {
      /* private mode */
    }
  }, [spoilerGuard]);

  // which hosted STT serves push-to-talk; speechService reads it on every turn, so a flip is immediate
  const [stt, setStt] = useState<SttProvider>(getSttProvider);
  const chooseStt = (option: (typeof STT_OPTIONS)[number]) => {
    if (option.id === stt) return;
    setSttProvider(option.id);
    setStt(option.id);
    toast.success(option.toast);
  };

  const playerHostRef = useRef<HTMLDivElement | null>(null);
  const player = useYouTubePlayer(playerHostRef, videoId);
  const asr = useSpeechRecognition();
  const notesRef = useRef<VideoNotesState | null>(null);
  // The playhead says 0 until the video has been moved to where the learner left off, and getCurrentTime() lags a
  // seek by a moment. Reporting that 0 (to the server or to this browser's own copy) would overwrite the saved
  // place, so nothing is reported until the playhead has really landed: placedRef = the starting point was chosen,
  // reportableRef = the position can be trusted.
  const placedRef = useRef<string | null>(null);
  const reportableRef = useRef<string | null>(null);
  const playerLatest = useRef(player);
  playerLatest.current = player;
  const goodPosRef = useRef({ t: 0, mw: 0 });
  const lastHeartbeatRef = useRef<number | null>(null);
  const lastSavedRef = useRef<number | null>(null);
  /** The live playhead, or the last good reading while the player is unavailable (it reports 0 then). The
   *  high-water mark lives in a ref of the player hook, so it is valid even while the player itself is not. */
  const readPosition = () => {
    const p = playerLatest.current;
    const mw = p.maxWatched();
    if (!p.isReady?.()) return { t: goodPosRef.current.t, mw };
    goodPosRef.current = { t: p.getCurrentTime(), mw };
    return goodPosRef.current;
  };
  const socket = useStudySocket({
    videoId,
    language: langMode,
    spoilerGuard,
    // heartbeat + utterances: also the resume point (Tier 2 library, written behind on the server)
    getPlayback: () => {
      const pos = readPosition();
      return { playback_s: pos.t, max_watched_s: pos.mw, duration_s: player.duration || undefined };
    },
    canReportPlayback: () => player.status === 'ready' && reportableRef.current === videoId,
    // a paused tab whose playhead has not moved has nothing new to say: an idle second tab (or one left open
    // overnight) must not keep re-stamping its old position over the tab the learner actually watched in
    heartbeatDue: () => {
      const t = readPosition().t;
      const last = lastHeartbeatRef.current;
      if (!playerLatest.current.isPlaying && last != null && Math.abs(t - last) < 1) return false;
      lastHeartbeatRef.current = t;
      return true;
    },
    onNoteEvent: (e) => notesRef.current?.onNoteEvent(e), // voice notes (Tier 1e)
  });
  const notes = useVideoNotes(videoId, socket.sessionId);
  notesRef.current = notes;

  // transcript ingestion (Tier 1a): status streams over the socket, segments feed the Transcript tab
  const transcript = useVideoTranscript(videoId, socket.videoStatus, socket.status === 'open');
  // chapters + structured summary (Tier 2): generated server-side after ingestion, pushed with video.status
  const outline = useVideoOutline(videoId, socket.videoStatus, socket.status === 'open');
  const transcriptChip =
    transcript.status === 'ready'
      ? null
      : IN_PROGRESS_STATUSES.includes(transcript.status)
        ? {
            dot: 'bg-amber-400 animate-pulse',
            label: transcript.status === 'transcribing' ? 'Transcribing…' : transcript.status === 'embedding' ? 'Indexing…' : 'Preparing transcript…',
            title: 'Getting the transcript ready for Q&A and smart seek. Voice playback works now.',
          }
        : {
            dot: 'bg-slate-400',
            label: 'Playback only',
            title: 'No usable transcript — see the Transcript tab for the reason. Voice playback still works.',
          };

  // Q&A chat (Tier 1b): typed questions stream in over the same socket; voice answers land here too
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [chatBusy, setChatBusy] = useState(false);
  useEffect(() => setChat([]), [videoId]);
  const clockNow = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const patchChat = (id: string, patch: Partial<ChatMessage>) =>
    setChat((c) => c.map((m) => (m.id === id ? { ...m, ...patch } : m)));

  const sendChat = useCallback(
    async (text: string) => {
      const id = `${Date.now()}`;
      setChat((c) => [
        ...c,
        { id: `${id}-u`, role: 'user', text, time: clockNow(), via: 'typed' },
        { id: `${id}-a`, role: 'ai', text: '', time: clockNow(), via: 'typed', streaming: true },
      ]);
      setChatBusy(true);
      let streamed = '';
      const { msg } = await socket.sendUtterance(text, {
        onDelta: (d) => {
          streamed += d;
          patchChat(`${id}-a`, { text: streamed });
        },
      });
      if (msg.type !== 'error') noteReplyLanguage(msg.language);
      if (msg.type === 'action') {
        const done = executePlayerAction(player, msg.action); // typed commands ("pause", "go to 12:30") work too
        patchChat(`${id}-a`, {
          text: done ? msg.message : playerUnavailableMessage(msg.language ?? language),
          streaming: false,
        });
      } else if (msg.type === 'answer.done') {
        patchChat(`${id}-a`, { text: msg.text, streaming: false, followUp: followUpContext(msg, language) });
      } else {
        patchChat(`${id}-a`, { text: msg.message, streaming: false, isError: true });
      }
      setChatBusy(false);
    },
    [socket.sendUtterance, player, language, noteReplyLanguage]
  );

  // the video is fullscreen (VideoPane's button): the voice turn shows as a small caption on the video, not the modal
  const { isFullscreen: videoFullscreen } = useAppFullscreen();
  const voiceConnecting =
    socket.status === 'open' || socket.status === 'unauthorized' ? null : socket.waking ? 'waking' : 'reconnecting';

  const ptt = useTildePTT({
    language,
    asr,
    player,
    sendUtterance: socket.sendUtterance,
    cancelTurn: socket.cancelTurn,
    onReplyLanguage: noteReplyLanguage,
    onTurn: (userText, reply, meta) => {
      // player commands are confirmed in the voice modal; voice notes land in the Notes tab
      if (meta.isAction || meta.route === 'notes') return;
      const id = `${Date.now()}-v`;
      setChat((c) => [
        ...c,
        { id: `${id}-u`, role: 'user', text: userText, time: clockNow(), via: 'voice' },
        { id: `${id}-a`, role: 'ai', text: reply, time: clockNow(), via: 'voice', followUp: meta.followUp },
      ]);
    },
  });

  const seekToTimestamp = useCallback(
    (ts: string) => {
      setActiveTimestamp(ts);
      const secs = parseClock(ts);
      if (!Number.isNaN(secs)) player.seekTo(secs);
    },
    [player]
  );

  // resume point + how far this learner has watched before (Tier 2 library). The high-water mark from
  // earlier sessions counts for the no-spoiler rule: they've seen it.
  const [resume, setResume] = useState<ResumePoint | null>(null);
  const [resumeLoaded, setResumeLoaded] = useState(false);
  useEffect(() => {
    let alive = true;
    setResume(null);
    setResumeLoaded(false);
    void fetchResume(videoId).then((r) => {
      if (!alive) return;
      if (r && r.video_id === videoId) setResume(r);
      setResumeLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, [videoId]);
  useEffect(() => {
    if (!resumeLoaded) return;
    // the highest mark either copy knows: a failed fetch must not reset what the learner has already seen
    const server = resume && resume.video_id === videoId ? resume : null;
    const mw = pickMaxWatched(server, loadLocalPosition(videoId));
    if (mw > 0) playerLatest.current.seedMaxWatched(mw);
  }, [resume, resumeLoaded, videoId]);

  // Move the playhead to the saved place. Nothing playing yet (cued / unstarted): CUE it there, which needs no
  // autoplay permission and makes no sound; seekTo on a cued video would start playback (and be blocked or heard).
  // Otherwise seek, and keep it paused if the learner had not pressed play.
  const moveTo = (target: number, keepPlaying: boolean) => {
    const p = playerLatest.current;
    if (p.playerState === 5 || p.playerState === -1) {
      p.cueAt(target);
      return;
    }
    p.seekTo(target);
    if (!keepPlaying) window.setTimeout(() => playerLatest.current.pause(), 300);
  };

  // Positions may be reported once the playhead has really landed where we put it (see reportableRef above). A seek
  // that did not take is repeated, quietly, for up to a minute (and re-paused if the learner had not pressed play).
  // Reporting unlocks early only when the learner has clearly taken over (playing, the playhead advancing), and
  // never on a playhead still sitting at the start while the saved place is far ahead: that 0 would overwrite it.
  // needPlayback: the saved place is unknown (the fetch failed and this browser has no copy), so nothing is
  // reported until the learner has really watched for a few seconds.
  const unlockReporting = (target: number | null, opts: { wasPlaying?: boolean; needPlayback?: boolean } = {}) => {
    const startedAt = Date.now();
    let tries = 0;
    let lastT = -1;
    const check = () => {
      const p = playerLatest.current;
      if (!p.isReady?.()) return; // the page was left
      const t = p.getCurrentTime();
      const advancing = p.isPlaying && lastT >= 0 && t > lastT + 1;
      lastT = t;
      if (opts.needPlayback) {
        if (advancing && t >= 15) {
          reportableRef.current = videoId;
          return;
        }
      } else if (target == null || t >= target - 10) {
        reportableRef.current = videoId;
        return;
      } else if (advancing && Date.now() - startedAt > 6000) {
        reportableRef.current = videoId; // the learner took over before the seek landed
        return;
      } else if (tries < 3) {
        tries += 1;
        moveTo(target, !!opts.wasPlaying);
      }
      if (Date.now() - startedAt < 60000) window.setTimeout(check, 1500);
    };
    window.setTimeout(check, 1500);
  };

  // where the video starts, once per video: a deep link (?t=<s> or state.timestamp) wins, else the resume point
  // (the newer of the server's copy and this browser's own copy)
  const queryT = new URLSearchParams(location.search).get('t');
  useEffect(() => {
    if (player.status !== 'ready' || placedRef.current === videoId) return;
    const explicit = queryT ? formatClock(Number(queryT)) : location.state?.timestamp;
    if (explicit) {
      placedRef.current = videoId;
      seekToTimestamp(explicit);
      const secs = parseClock(explicit);
      unlockReporting(Number.isFinite(secs) ? secs : null, { wasPlaying: true });
      // A deep link applies ONCE. Left in the URL or the history state, a reload, a back navigation or a restored
      // tab would apply it again and overwrite the place the learner actually reached.
      const rest = new URLSearchParams(location.search);
      rest.delete('t');
      const search = rest.toString();
      navigate({ pathname: location.pathname, search: search ? `?${search}` : '' }, { replace: true, state: null });
      return;
    }
    if (!resumeLoaded) return;
    placedRef.current = videoId;
    const server = resume && resume.video_id === videoId ? resume : null;
    const local = loadLocalPosition(videoId);
    const best = pickResumeSeconds(server, local);
    // the duration may still be unknown here (the player reports 0 until its metadata loads): this browser kept it
    const at = resumeTarget(best == null ? null : { last_position_s: best }, player.duration || local?.d || 0);
    if (at == null) {
      unlockReporting(null, { needPlayback: !server && !local });
      return;
    }
    const wasPlaying = player.isPlaying;
    unlockReporting(at, { wasPlaying });
    moveTo(at, wasPlaying);
    toast(language === 'hi' ? `${formatClock(at)} से आगे शुरू किया` : `Resumed at ${formatClock(at)}`, {
      action: { label: language === 'hi' ? 'शुरू से देखें' : 'Start over', onClick: () => player.seekTo(0) },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player.status, resumeLoaded, videoId, queryT, location.state]);

  // This browser keeps its own copy of the position, so coming back never depends on one fetch or on the server's
  // write-behind lag: every 3 s, on pause, and when the page is hidden or closed (the exact position is also pushed
  // to the server then). Never before the playhead can be trusted, and never read at unmount, when the player is
  // already destroyed and would say 0.
  const socketRef = useRef(socket);
  socketRef.current = socket;
  const saveLocal = () => {
    if (reportableRef.current !== videoId) return;
    const pos = readPosition();
    const p = playerLatest.current;
    // a paused tab whose playhead has not moved has nothing new to save (an idle tab must not re-stamp an old place)
    if (!p.isPlaying && lastSavedRef.current != null && Math.abs(pos.t - lastSavedRef.current) < 1) return;
    lastSavedRef.current = pos.t;
    saveLocalPosition(videoId, pos.t, pos.mw, p.duration);
  };
  // leaving the study page inside the app: layout-effect cleanups run BEFORE the player is destroyed (a passive
  // cleanup), so the live playhead is still readable here, and the exact place is saved and pushed
  useLayoutEffect(
    () => () => {
      saveLocal();
      socketRef.current.sendPlaybackNow();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  useEffect(() => {
    if (player.status !== 'ready') return;
    const onHide = () => {
      saveLocal();
      socketRef.current.sendPlaybackNow();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') onHide();
    };
    const id = window.setInterval(saveLocal, 3000);
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player.status, videoId]);
  useEffect(() => {
    // paused or ended: the exact place, now (the 5 s heartbeat only runs while the socket is open)
    if (player.isPlaying || player.status !== 'ready' || reportableRef.current !== videoId) return;
    saveLocal();
    socketRef.current.sendPlaybackNow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player.isPlaying]);

  useEffect(() => {
    try {
      localStorage.setItem('studyloop.langMode', langMode);
      localStorage.setItem('studyloop.lang', language); // the other pages show the language the conversation is in
    } catch {
      /* private mode */
    }
  }, [langMode, language]);

  useEffect(() => {
    if (ptt.error) toast.error(ptt.error);
  }, [ptt.error]);

  useEffect(() => resetSeekHistory(), [videoId]);

  // "Study" in the sidebar / mobile nav reopens the video last played, so remember it once it really plays
  useEffect(() => {
    if (player.isPlaying) setLastVideo(videoId);
  }, [player.isPlaying, videoId]);

  // answering in Hindi (chosen, or detected in Auto): spoken answers need a Hindi voice (hosted or the browser's);
  // say so once if the browser has none
  const hindiVoiceChecked = useRef(false);
  useEffect(() => {
    if (language !== 'hi' || hindiVoiceChecked.current) return;
    hindiVoiceChecked.current = true;
    void hasVoiceFor('hi').then((has) => {
      if (!has) toast.warning(HINDI_VOICE_NOTICE, { duration: 9000 });
    });
  }, [language]);

  // Dev only: drive the full voice pipeline with typed text (no mic needed), e.g. in the preview pane:
  //   await window.__studyloopSay('go back 30 seconds')
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const w = window as unknown as { __studyloopSay?: (text: string) => Promise<void> };
    w.__studyloopSay = ptt.processText;
    return () => {
      delete w.__studyloopSay;
    };
  }, [ptt.processText]);

  // the backend knows the title even when the embedded player never loads (blocked iframe, embedding disabled)
  const backendTitle = socket.videoStatus?.video_id === videoId ? socket.videoStatus.title : null;
  const videoTitle = player.title || backendTitle || location.state?.videoTitle || 'Loading video…';

  // One-tap revision sheet: the big picture, key points watched so far, chapters, every question asked about this
  // lecture (all sessions, from the server, plus this page's), notes and the moments worth rewatching → Save as PDF
  const openRevisionSheet = async () => {
    const hi = language === 'hi';
    const busy = toast.loading(hi ? 'Revision sheet बन रही है…' : 'Building your revision sheet…');
    const qa: RevisionQA[] = [];
    const seen = new Set<string>();
    const add = (q: RevisionQA) => {
      const key = `${q.question.trim()}
${q.answer.trim()}`;
      if (!q.question.trim() || !q.answer.trim() || seen.has(key)) return;
      seen.add(key);
      qa.push(q);
    };
    try {
      const sessions = await fetchChats(50);
      sessions
        .filter((sess) => sess.video_id === videoId)
        .reverse() // oldest session first
        .forEach((sess) => sess.turns.filter(isConversation).forEach((t) => add({ question: t.question, answer: t.answer, at_s: t.at_s })));
    } catch {
      /* offline / signed out: this page's own Q&A below still goes in */
    }
    // this page's grounded answers (the server's copy can lag the last turn)
    chat.forEach((m, i) => {
      const q = chat[i - 1];
      if (m.role === 'ai' && m.followUp && q?.role === 'user') add({ question: q.text, answer: m.text, at_s: null });
    });
    qa.sort((a, b) => (a.at_s ?? Infinity) - (b.at_s ?? Infinity));
    const html = revisionSheetHtml({
      videoId,
      title: videoTitle,
      exportedAt: new Date(),
      language,
      watchedS: player.maxWatched(),
      durationS: player.duration,
      spoilerGuard,
      outline: pickOutline(outline.outline, language).doc,
      qa,
      notes: notes.notes,
    });
    toast.dismiss(busy);
    printHtml(html);
  };

  const handleShareSession = () => {
    // built from the id: the address bar has no ?v= when the video came from router state
    const shareUrl = `${window.location.origin}${studyUrl(videoId)}`;
    navigator.clipboard.writeText(shareUrl).then(
      () => toast.success('Link to this video copied'),
      () => toast.error("Couldn't copy the link")
    );
  };

  const handleOpenSettings = () => {
    navigate('/settings');
  };

  return (
    <div className="flex flex-col min-h-full flex-1 bg-obsidian">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/80 bg-surface-card/60 flex-shrink-0 z-10 backdrop-blur-md">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Icon name="PlayCircleIcon" size={16} className="text-indigo-400" />
            <span className="text-xs font-medium text-muted-foreground hidden sm:block">Now Studying:</span>
          </div>
          <span className="text-sm font-bold text-foreground truncate max-w-xs sm:max-w-md lg:max-w-lg">
            {videoTitle}
          </span>

        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {socket.status === 'unauthorized' ? (
            <button
              onClick={() => navigate(`/login?next=${encodeURIComponent(studyUrl(videoId))}`)}
              className="lang-badge-en text-xs font-semibold px-2.5 py-1 rounded-full flex items-center gap-1.5 text-red-300"
              title="The voice server rejected your session — sign in again"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
              Sign in again
            </button>
          ) : (
            <span
              className="lang-badge-en text-xs font-semibold px-2.5 py-1 rounded-full flex items-center gap-1.5"
              title={
                socket.status === 'open'
                  ? 'Voice server connected'
                  : socket.waking
                    ? 'Waking up the voice server (can take up to a minute on the free tier)'
                    : 'The connection dropped. Reconnecting; a voice command waits a few seconds, then you can ask again.'
              }
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  socket.status === 'open' ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'
                }`}
              />
              {socket.status === 'open' ? 'Voice ready' : socket.waking ? 'Connecting…' : 'Reconnecting…'}
            </span>
          )}
          {transcriptChip && (
            <span
              className="lang-badge-en text-xs font-semibold px-2.5 py-1 rounded-full hidden md:flex items-center gap-1.5"
              title={transcriptChip.title}
              role="status"
            >
              <span className={`w-1.5 h-1.5 rounded-full ${transcriptChip.dot}`} />
              {transcriptChip.label}
            </span>
          )}
          <button
            onClick={() => {
              setSpoilerGuard((on) => !on);
              toast.success(
                spoilerGuard
                  ? 'Spoilers allowed: answers can use the whole lecture'
                  : "No spoilers: answers only use what you've watched"
              );
            }}
            role="switch"
            aria-checked={spoilerGuard}
            aria-label="No-spoiler answers"
            title={
              spoilerGuard
                ? "No spoilers: Q&A and summaries only use what you've watched. Click to allow the whole lecture."
                : "Spoilers allowed: Q&A and summaries can use the whole lecture. Click to limit them to what you've watched."
            }
            className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border flex items-center gap-1.5 transition-colors ${
              spoilerGuard
                ? 'border-cyan-500/40 text-cyan-300 bg-cyan-500/10'
                : 'border-amber-500/40 text-amber-300 bg-amber-500/10'
            }`}
          >
            <Icon name={spoilerGuard ? 'EyeSlashIcon' : 'EyeIcon'} size={13} />
            <span className="hidden sm:inline">{spoilerGuard ? 'No spoilers' : 'Spoilers on'}</span>
          </button>
          <div
            className="hidden md:flex rounded-full border border-border/80 overflow-hidden text-[11px] font-semibold"
            role="group"
            aria-label="Speech-to-text provider"
            title="Who turns your push-to-talk speech into text. Sarvam: Indian code-mix model, uses Sarvam credit per turn. Groq: Whisper, free. The other one takes over if the chosen one fails."
          >
            {STT_OPTIONS.map((option) => (
              <button
                key={option.id}
                onClick={() => chooseStt(option)}
                className={`px-2 py-1 transition-colors ${
                  stt === option.id ? 'bg-emerald-600 text-white' : 'text-muted-foreground hover:text-foreground'
                }`}
                aria-pressed={stt === option.id}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="flex rounded-full border border-border/80 overflow-hidden text-[11px] font-semibold" role="group" aria-label="Response language">
            {(['auto', 'en', 'hi'] as LangMode[]).map((l) => (
              <button
                key={l}
                onClick={() => setLangMode(l)}
                className={`px-2 py-1 transition-colors ${
                  langMode === l ? 'bg-indigo-600 text-white' : 'text-muted-foreground hover:text-foreground'
                }`}
                aria-pressed={langMode === l}
                title={
                  l === 'auto'
                    ? `Answers in the language you speak: English, Hindi or Hinglish (now: ${language === 'hi' ? 'Hindi' : 'English'})`
                    : l === 'en'
                      ? 'Always answer in English'
                      : 'Always answer in Hindi'
                }
              >
                {l === 'auto' ? 'Auto' : l === 'en' ? 'EN' : 'हिं'}
              </button>
            ))}
          </div>
          <button
            onClick={() => ptt.startListening()}
            className="px-2.5 py-1 rounded-xl bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 text-xs font-semibold flex items-center gap-1.5 hover:bg-indigo-600/40 transition-colors shadow-glow-indigo-sm"
            title="Hold ~ or click to ask voice question"
          >
            <Icon name="MicrophoneIcon" size={14} className="text-indigo-400 ptt-pulse" />
            <span className="hidden sm:inline font-bold">Voice Copilot</span>
            <kbd className="hidden md:inline-block px-1.5 py-0.2 text-[10px] font-mono rounded bg-indigo-950/80 border border-indigo-500/40 text-indigo-200 font-semibold">~</kbd>
          </button>
          <button
            onClick={() => void openRevisionSheet()}
            className="px-2.5 py-1.5 rounded-xl hover:bg-surface-elevated text-muted-foreground hover:text-foreground transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-semibold"
            title={
              language === 'hi'
                ? 'Revision sheet: मुख्य बातें, आपके सवाल, notes और दोबारा देखने लायक हिस्से (PDF)'
                : 'Revision sheet: key points, your questions, notes and moments to rewatch (save as PDF)'
            }
            aria-label="Revision sheet"
          >
            <Icon name="AcademicCapIcon" size={16} />
            <span className="hidden xl:inline">Revision sheet</span>
          </button>
          <button
            onClick={handleShareSession}
            className="p-2 rounded-xl hover:bg-surface-elevated text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            title="Copy a link to this video"
            aria-label="Copy a link to this video"
          >
            <Icon name="ShareIcon" size={16} />
          </button>
          <button
            onClick={handleOpenSettings}
            className="p-2 rounded-xl hover:bg-surface-elevated text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            title="Open Copilot Settings (/settings)"
            aria-label="Open Copilot Settings"
          >
            <Icon name="Cog6ToothIcon" size={16} />
          </button>
        </div>
      </div>

      {/* Main Content Area — Responsive 2-Pane Layout */}
      <div className="flex flex-col lg:flex-row flex-1 min-h-0 relative">
        {/* Left: Video Pane */}
        <div className="flex-1 min-w-0 flex flex-col min-h-[480px] lg:min-h-full relative border-b lg:border-b-0 lg:border-r border-border/80">
          <VideoPane
            activeTimestamp={activeTimestamp}
            onTimestampClick={seekToTimestamp}
            onOpenVoiceModal={() => ptt.startListening()}
            player={player}
            videoId={videoId}
            playerHostRef={playerHostRef}
            outline={outline}
            transcriptStatus={transcript.status}
            language={language}
            spoilerGuard={spoilerGuard}
            watchedS={player.maxWatched()}
            fullscreenOverlay={
              ptt.isOpen ? (
                <VoiceCaption
                  stage={ptt.stage}
                  recognizedText={ptt.recognizedText}
                  aiResponse={ptt.aiResponse}
                  answerSpoken={ptt.answerSpoken}
                  notice={ptt.notice}
                  connecting={voiceConnecting}
                  language={language}
                  onSeekTimestamp={seekToTimestamp}
                  onDone={ptt.closeModal}
                  spoken={ptt.spoken}
                  followUp={ptt.meta?.followUp}
                  onAsk={(t) => void ptt.processText(t)}
                  onSeek={(s) => player.seekTo(s)}
                />
              ) : null
            }
          />
        </div>

        {/* Right: AI Agent Panel */}
        <div className="w-full lg:w-[380px] xl:w-[420px] 2xl:w-[460px] flex-shrink-0 flex flex-col min-h-[500px] lg:min-h-full bg-obsidian/40">
          <AIAgentPanel
            transcript={transcript}
            chat={chat}
            chatBusy={chatBusy}
            onSendChat={(t) => void sendChat(t)}
            currentTime={player.currentTime}
            language={language}
            onTimestampClick={seekToTimestamp}
            onOpenVoiceModal={() => ptt.startListening()}
            notes={notes}
            videoId={videoId}
            videoTitle={player.title || backendTitle || location.state?.videoTitle || videoId}
            onSeek={(secs) => player.seekTo(secs)}
            spoilerGuard={spoilerGuard}
          />
        </div>
      </div>

      {/* Voice Modal (Triggered via ~ Key or UI Button) */}
      {ptt.isOpen && !videoFullscreen && (
        <VoiceModal
          stage={ptt.stage}
          recognizedText={ptt.recognizedText}
          aiResponse={ptt.aiResponse}
          activeStep={ptt.activeStep}
          onStartListening={ptt.startListening}
          onStopListening={ptt.stopListeningAndProcess}
          onClose={ptt.closeModal}
          onSeekTimestamp={seekToTimestamp}
          meta={ptt.meta}
          // Firefox has no browser ASR, but hosted speech-to-text serves it: voice is only unsupported with neither
          asrSupported={asr.supported || (hostedSttAvailable() && captureSupported())}
          connecting={voiceConnecting}
          notice={ptt.notice}
          canAskAgain={ptt.canAskAgain}
          onAskAgain={ptt.askAgain}
          spoken={ptt.spoken}
          onAsk={(t) => void ptt.processText(t)}
          onSeek={(s) => player.seekTo(s)}
        />
      )}
    </div>
  );
}
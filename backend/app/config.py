"""Central settings. Every secret lives here (server-side only) — see ENV_REFERENCE.md."""

from functools import lru_cache
from typing import Annotated, Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    env: Literal["dev", "prod", "test"] = "dev"
    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:4028"]

    supabase_url: str = ""
    supabase_jwt_secret: str = ""
    supabase_service_key: str = ""
    database_url: str = ""
    # true in every real deployment (render.yaml, .env.example) since Tier 0b wired Supabase sign-in.
    # false = anonymous demo mode. Tokens that ARE sent are always verified either way.
    require_auth: bool = False

    transcript_api_key: str = ""
    transcript_api_base: str = "https://transcriptapi.com/api/v2"
    transcript_languages: str = "en,hi,asr-hi"
    transcript_timeout_s: float = 60.0

    groq_api_key: str = ""
    # Groq's lineup (Sep 2026) no longer serves Llama 3.3; gpt-oss is multilingual (Devanagari) + tool calling
    groq_model: str = "openai/gpt-oss-120b"  # answers (RAG, summaries)
    groq_router_model: str = "openai/gpt-oss-20b"  # llm_router tool call; empty = groq_model
    groq_reasoning_effort: str = "low"  # gpt-oss reasons before answering; low keeps first-token latency down
    gemini_api_key: str = ""
    # 2.5 models are closed to new keys (Sep 2026); 3.x reasons first, so it gets low effort + headroom
    gemini_model: str = "gemini-3.6-flash"
    gemini_reasoning_effort: str = "low"
    llm_timeout_s: float = 30.0
    # LangGraph checkpointer: "memory" (dev) or "postgres" (prod; needs DATABASE_URL — on Render use the
    # Supabase *session pooler* URL, the direct db.<ref>.supabase.co host is IPv6-only)
    checkpointer: Literal["memory", "postgres"] = "memory"
    hf_token: str = ""
    hf_inference_base: str = "https://router.huggingface.co/hf-inference"
    embed_timeout_s: float = 30.0
    e5_model_dir: str = ""  # optional CPU fallback embedder (Tier 1a); empty = off

    # hosted speech (roadmap D14): Sarvam Saaras (STT, code-mixed Hindi/English) → Groq Whisper fallback;
    # Sarvam Bulbul (TTS). Without keys the browser's own SpeechRecognition / speechSynthesis are used.
    sarvam_api_key: str = ""
    sarvam_base: str = "https://api.sarvam.ai"
    stt_providers: str = "sarvam,groq"  # tried in order; only configured ones count
    sarvam_stt_model: str = "saaras:v3"
    sarvam_stt_mode: str = "codemix"  # English words in Latin, Hindi in Devanagari, numbers as digits
    groq_stt_model: str = "whisper-large-v3"
    stt_timeout_s: float = 8.0
    sarvam_tts_model: str = "bulbul:v3"
    sarvam_tts_speaker: str = "shubh"
    sarvam_tts_pace: float = 1.05
    tts_timeout_s: float = 15.0

    classifier: Literal["regex", "onnx"] = "regex"
    confidence_threshold: float = 0.85

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, v: object) -> object:
        if isinstance(v, str) and not v.strip().startswith("["):
            return [o.strip() for o in v.split(",") if o.strip()]
        return v

    @property
    def auth_enabled(self) -> bool:
        return bool(self.supabase_url or self.supabase_jwt_secret)


@lru_cache
def get_settings() -> Settings:
    return Settings()

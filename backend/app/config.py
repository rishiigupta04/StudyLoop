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
    gemini_api_key: str = ""
    hf_token: str = ""

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

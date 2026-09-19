"""Supabase JWT verification. The client signs in with supabase-js; we only verify.

Supports both Supabase signing modes:
- legacy HS256 shared secret (SUPABASE_JWT_SECRET)
- asymmetric keys (ES256/RS256) via the project's JWKS endpoint
"""

from dataclasses import dataclass
from functools import lru_cache

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import Settings, get_settings

_bearer = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class User:
    id: str
    email: str | None = None


@lru_cache
def _jwks_client(supabase_url: str) -> jwt.PyJWKClient:
    # keys rotate rarely: cache the set for an hour; never let a slow fetch hang a WS hello for long
    return jwt.PyJWKClient(
        f"{supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json", cache_keys=True, lifespan=3600, timeout=5
    )


def warm_jwks(settings: Settings) -> bool:
    """Fetch the signing keys at startup so the first sign-in doesn't pay for it. Never raises."""
    if not settings.supabase_url:
        return False
    try:
        return bool(_jwks_client(settings.supabase_url).get_jwk_set().keys)
    except jwt.PyJWKClientError:
        return False


def verify_token(token: str, settings: Settings) -> User:
    try:
        header = jwt.get_unverified_header(token)
        if header.get("alg") == "HS256":
            if not settings.supabase_jwt_secret:
                raise jwt.InvalidTokenError("HS256 token but SUPABASE_JWT_SECRET is not set")
            key: object = settings.supabase_jwt_secret
            algorithms = ["HS256"]
        else:
            key = _jwks_client(settings.supabase_url).get_signing_key_from_jwt(token).key
            algorithms = ["ES256", "RS256"]
        claims = jwt.decode(token, key, algorithms=algorithms, audience="authenticated")
    except jwt.PyJWTError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, f"Invalid token: {exc}") from exc
    return User(id=claims["sub"], email=claims.get("email"))


ANONYMOUS = User(id="00000000-0000-0000-0000-000000000000", email=None)


def resolve_user(token: str | None, settings: Settings) -> User:
    """Shared by REST and WebSocket. A presented token is always verified; no token is only
    accepted while REQUIRE_AUTH is false (anonymous demo mode)."""
    if token:
        return verify_token(token, settings)
    if settings.require_auth:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing bearer token")
    return ANONYMOUS


def current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
    settings: Settings = Depends(get_settings),
) -> User:
    return resolve_user(creds.credentials if creds else None, settings)

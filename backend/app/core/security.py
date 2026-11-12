"""Hash exact passwords and verify signed, expiring bearer claims."""
import base64
import hashlib
from datetime import datetime, timezone
from uuid import UUID
import bcrypt
import jwt
from app.core.config import Settings


def password_material(password: str) -> bytes:
    """Preprocess all UTF-8 bytes to avoid bcrypt's silent 72-byte truncation."""
    return base64.b64encode(hashlib.sha256(password.encode("utf-8")).digest())


def hash_password(password: str) -> str:
    """Salt and bcrypt-hash the exact password without trimming it."""
    return bcrypt.hashpw(password_material(password), bcrypt.gensalt()).decode("ascii")


def verify_password(password: str, stored_hash: str) -> bool:
    """Fail closed on corrupt hashes while comparing exact password material."""
    try:
        return bcrypt.checkpw(password_material(password), stored_hash.encode("ascii"))
    except (ValueError, UnicodeError):
        return False


def issue_token(user_id: UUID, session_id: UUID, expires_at: datetime, settings: Settings) -> str:
    """Sign user and session identities with an explicit expiration instant."""
    return jwt.encode({"sub": str(user_id), "jti": str(session_id),
                       "iat": datetime.now(timezone.utc), "exp": expires_at},
                      settings.jwt_secret.get_secret_value(), algorithm="HS256")


def decode_token(token: str, settings: Settings) -> tuple[UUID, UUID]:
    """Require a valid signature, expiry and UUID identities.

    Raises:
        ValueError: Any bearer token validation fails.
    """
    try:
        claims = jwt.decode(token, settings.jwt_secret.get_secret_value(), algorithms=["HS256"],
                            options={"require": ["sub", "jti", "exp", "iat"]})
        return UUID(claims["sub"]), UUID(claims["jti"])
    except (jwt.InvalidTokenError, ValueError, TypeError, KeyError) as exc:
        raise ValueError("Invalid session") from exc

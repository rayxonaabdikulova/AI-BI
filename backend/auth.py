"""JWT authentication and in-memory user store for development and tests."""

from __future__ import annotations

import json
import os
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Annotated, Any

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from passlib.context import CryptContext

SECRET_KEY = os.environ.get(
    "JWT_SECRET_KEY",
    "dev-insecure-secret-change-with-JWT_SECRET_KEY-in-production",
)
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer(auto_error=False)
MAX_BCRYPT_PASSWORD_BYTES = 72

# Mock user database: username -> { "username", "hashed_password" }
fake_users_db: dict[str, dict[str, str]] = {}
AUTH_DB_FILE: Path = Path(__file__).resolve().parent / "data" / "auth_users.json"


def _load_users_from_disk() -> None:
    if not AUTH_DB_FILE.is_file():
        return
    try:
        payload = json.loads(AUTH_DB_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return
    if not isinstance(payload, dict):
        return
    for username, row in payload.items():
        if (
            isinstance(username, str)
            and isinstance(row, dict)
            and isinstance(row.get("hashed_password"), str)
        ):
            fake_users_db[username] = {
                "username": username,
                "hashed_password": row["hashed_password"],
            }


def _save_users_to_disk() -> None:
    AUTH_DB_FILE.parent.mkdir(parents=True, exist_ok=True)
    serializable = {
        username: {"hashed_password": row["hashed_password"]}
        for username, row in fake_users_db.items()
    }
    AUTH_DB_FILE.write_text(json.dumps(serializable, ensure_ascii=False, indent=2), encoding="utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    if len(plain_password.encode("utf-8")) > MAX_BCRYPT_PASSWORD_BYTES:
        return False
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    _ensure_bcrypt_password_length(password)
    return pwd_context.hash(password)


def _ensure_bcrypt_password_length(password: str) -> None:
    n_bytes = len(password.encode("utf-8"))
    if n_bytes > MAX_BCRYPT_PASSWORD_BYTES:
        raise ValueError(
            f"Password is too long for bcrypt ({n_bytes} bytes). "
            f"Please use at most {MAX_BCRYPT_PASSWORD_BYTES} UTF-8 bytes."
        )


def register_user(username: str, password: str) -> None:
    if username in fake_users_db:
        raise ValueError("Username already registered")
    _ensure_bcrypt_password_length(password)
    fake_users_db[username] = {
        "username": username,
        "hashed_password": get_password_hash(password),
    }
    _save_users_to_disk()


def get_user_public(username: str) -> dict[str, str] | None:
    row = fake_users_db.get(username)
    if row is None:
        return None
    return {"username": row["username"]}


def authenticate_user(username: str, password: str) -> dict[str, str] | None:
    row = fake_users_db.get(username)
    if row is None:
        return None
    if not verify_password(password, row["hashed_password"]):
        return None
    return {"username": row["username"]}


def create_access_token(
    data: dict[str, Any],
    expires_delta: timedelta | None = None,
) -> str:
    to_encode = data.copy()
    expire = datetime.now(UTC) + (
        expires_delta if expires_delta is not None else timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode["exp"] = expire
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


async def get_current_user(
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(security)],
) -> dict[str, str]:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if creds is None or creds.scheme.lower() != "bearer":
        raise credentials_exception
    token = creds.credentials
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        sub = payload.get("sub")
        if not isinstance(sub, str) or not sub:
            raise credentials_exception
    except JWTError:
        raise credentials_exception from None
    user = get_user_public(sub)
    if user is None:
        raise credentials_exception
    return user


_load_users_from_disk()

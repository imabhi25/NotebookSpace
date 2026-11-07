from datetime import datetime, timezone, timedelta
import hashlib
import hmac
import secrets
from typing import Any
from fastapi import HTTPException, Request, Depends
from db.notebook_store import create_session, get_session, delete_session, get_user_by_email, create_user

DEMO_USER_EMAIL = "student@notebookspace.local"
DEMO_USER_PW = "student_notebook_pass"


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    hashed = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 100000).hex()
    return f"{salt}${hashed}"


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        salt, expected_hash = stored_hash.split("$", 1)
        candidate = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 100000).hex()
        return hmac.compare_digest(expected_hash, candidate)
    except Exception:
        return False


def create_user_session(user_id: str) -> str:
    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(days=30)
    create_session(user_id=user_id, token=token, expires_at=expires_at)
    return token


def get_or_create_demo_user() -> dict[str, Any]:
    existing = get_user_by_email(DEMO_USER_EMAIL)
    if existing:
        return existing
    pw_hash = hash_password(DEMO_USER_PW)
    return create_user(email=DEMO_USER_EMAIL, password_hash=pw_hash)


def get_current_user(request: Request) -> dict[str, Any]:
    auth_header = request.headers.get("authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Authentication credentials were not provided. Please sign in.",
        )

    token = auth_header[7:].strip()
    session = get_session(token)
    if not session:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired session token. Please sign in again.",
        )

    return {
        "id": session["user_id"],
        "email": session["email"],
        "token": token,
    }


def get_optional_current_user(request: Request) -> dict[str, Any] | None:
    auth_header = request.headers.get("authorization", "")
    if not auth_header.startswith("Bearer "):
        return None
    token = auth_header[7:].strip()
    session = get_session(token)
    if not session:
        return None
    return {
        "id": session["user_id"],
        "email": session["email"],
        "token": token,
    }

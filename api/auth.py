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


def create_guest_user_and_session() -> tuple[dict[str, Any], str]:
    """Creates a fresh, isolated guest user and session for a new visitor."""
    import uuid
    guest_email = f"guest_{uuid.uuid4().hex[:12]}@notebookspace.local"
    pw_hash = hash_password(secrets.token_urlsafe(24))
    user = create_user(email=guest_email, password_hash=pw_hash)
    token = create_user_session(user["id"])
    return user, token


def get_current_user(request: Request) -> dict[str, Any]:
    auth_header = request.headers.get("authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Session credentials were not provided. Initializing guest session...",
        )

    token = auth_header[7:].strip()
    session = get_session(token)
    if not session:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired session token. Please refresh your guest session.",
        )

    email = session["email"]
    is_guest = email.startswith("guest_") and email.endswith("@notebookspace.local")
    display_email = "Guest Workspace" if is_guest else email

    return {
        "id": session["user_id"],
        "email": display_email,
        "raw_email": email,
        "token": token,
        "is_guest": is_guest,
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

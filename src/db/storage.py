"""Firebase Storage helpers — mirror menu assets so they can be embedded on our dashboard.

Uploads go through the Admin SDK (bypasses Storage security rules). Reads use a Firebase
download token baked into the returned URL, so <img>/<iframe> can load it without auth.
"""
from __future__ import annotations

import uuid
from urllib.parse import quote

import structlog

from src.db.client import get_firestore_client  # ensures firebase_admin is initialized

log = structlog.get_logger()

BUCKET = "asterley-bros-b29c0.firebasestorage.app"
_EXT = {
    "application/pdf": "pdf",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
}
_MAX_BYTES = 10_000_000


def upload_menu_asset(lead_id: str, data: bytes, mime: str) -> str | None:
    """Upload a menu PDF/image to Storage under menus/{lead_id}.{ext}.

    Returns a public Firebase download URL, or None on any failure (caller falls back to the
    source hotlink). Never raises.
    """
    ext = _EXT.get(mime)
    if not data or not ext or len(data) > _MAX_BYTES:
        return None

    try:
        # Initialize the firebase_admin app (no-op if already done).
        get_firestore_client()
        from firebase_admin import storage

        bucket = storage.bucket(BUCKET)
        path = f"menus/{lead_id}.{ext}"
        blob = bucket.blob(path)
        token = str(uuid.uuid4())
        blob.metadata = {"firebaseStorageDownloadTokens": token}
        blob.upload_from_string(data, content_type=mime)

        url = (
            f"https://firebasestorage.googleapis.com/v0/b/{BUCKET}"
            f"/o/{quote(path, safe='')}?alt=media&token={token}"
        )
        log.info("menu_asset_uploaded", lead_id=lead_id, path=path, bytes=len(data))
        return url
    except Exception as exc:
        log.warning("menu_asset_upload_failed", lead_id=lead_id, error=str(exc))
        return None

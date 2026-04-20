"""Firebase Admin + Firestore client singleton.

Firestore is optional — if credentials are missing or the connection hangs,
all callers get None and must handle that gracefully.
"""

from __future__ import annotations

import logging
import os
import threading

import structlog

log = structlog.get_logger()

_client = None
_init_attempted = False
_init_lock = threading.Lock()

_CONNECT_TIMEOUT = 15  # seconds — cold gRPC + JWT mint can take 3-10s on first call


def _try_connect(result_holder: list, event: threading.Event):
    """Run in a daemon thread so it can be abandoned if it hangs."""
    try:
        import firebase_admin
        from firebase_admin import credentials, firestore

        if not firebase_admin._apps:
            cred = credentials.ApplicationDefault()
            project_id = os.environ.get("FIREBASE_PROJECT_ID")
            options = {"projectId": project_id} if project_id else {}
            firebase_admin.initialize_app(cred, options)
            log.info("firebase_admin_initialized", project_id=project_id)

        client = firestore.client()

        # Smoke-test with a trivial read
        list(client.collection("leads").limit(1).stream())

        result_holder.append(client)
    except Exception as exc:
        log.warning("firestore_connect_error", error=str(exc))
    finally:
        event.set()


def get_firestore_client():
    """Return a cached Firestore client, or None if unavailable.

    First call attempts to connect with a timeout. If it fails or times out,
    all future calls immediately return None (no retries).
    """
    global _client, _init_attempted

    if _init_attempted:
        return _client

    with _init_lock:
        if _init_attempted:
            return _client

        result_holder: list = []
        done_event = threading.Event()

        t = threading.Thread(target=_try_connect, args=(result_holder, done_event), daemon=True)
        t.start()

        connected = done_event.wait(timeout=_CONNECT_TIMEOUT)

        if connected and result_holder:
            _client = result_holder[0]
            log.info("firestore_connected")
        else:
            if not connected:
                log.warning("firestore_connect_timeout", timeout=_CONNECT_TIMEOUT)
            _client = None

            # Suppress gRPC auth retry spam — the abandoned daemon thread keeps
            # firing AuthMetadataPlugin callbacks that flood stderr.
            logging.getLogger("google.auth.transport.grpc").setLevel(logging.CRITICAL)
            logging.getLogger("grpc").setLevel(logging.CRITICAL)
            logging.getLogger("google.auth").setLevel(logging.CRITICAL)
            logging.getLogger("urllib3.connectionpool").setLevel(logging.CRITICAL)

        _init_attempted = True
        return _client

"""Auth API router — invite users, manage team."""

from __future__ import annotations

import structlog
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

log = structlog.get_logger()

auth_router = APIRouter(prefix="/api/auth")


class InviteRequest(BaseModel):
    email: str
    display_name: str = ""
    role: str = "viewer"  # "admin" | "viewer"
    workspace_id: str = ""


class TeamMember(BaseModel):
    uid: str
    email: str
    display_name: str
    role: str
    workspace_id: str


@auth_router.post("/invite")
async def invite_user(req: InviteRequest):
    """Create a new Firebase Auth user + Firestore profile, send password reset."""
    import firebase_admin
    from firebase_admin import auth

    from src.db.firestore import get_firestore_client

    if req.role not in ("admin", "viewer"):
        raise HTTPException(status_code=400, detail="Role must be 'admin' or 'viewer'")

    try:
        # Create Firebase Auth user
        user = auth.create_user(
            email=req.email,
            display_name=req.display_name or req.email.split("@")[0],
        )

        # Generate password reset link so they set their own password
        reset_link = auth.generate_password_reset_link(req.email)

        # Create Firestore user profile
        db = get_firestore_client()
        if db:
            from datetime import datetime

            db.collection("users").document(user.uid).set({
                "email": req.email,
                "display_name": req.display_name or req.email.split("@")[0],
                "role": req.role,
                "workspace_id": req.workspace_id,
                "created_at": datetime.now().isoformat(),
                "invited_by": "",
            })

        log.info("user_invited", email=req.email, role=req.role, uid=user.uid)

        return {
            "uid": user.uid,
            "email": req.email,
            "role": req.role,
            "reset_link": reset_link,
        }

    except firebase_admin._auth_utils.EmailAlreadyExistsError:
        raise HTTPException(status_code=409, detail="Email already registered")
    except Exception as exc:
        log.error("invite_failed", email=req.email, error=str(exc))
        raise HTTPException(status_code=500, detail=str(exc))


@auth_router.get("/team")
async def list_team(workspace_id: str = ""):
    """List all users in a workspace."""
    db = get_firestore_client()
    if not db:
        return {"members": []}

    from google.cloud.firestore_v1.base_query import FieldFilter
    from src.db.firestore import get_firestore_client

    db = get_firestore_client()
    if not db:
        return {"members": []}

    try:
        query = db.collection("users")
        if workspace_id:
            query = query.where(filter=FieldFilter("workspace_id", "==", workspace_id))
        docs = [doc.to_dict() for doc in query.stream()]
        members = [
            TeamMember(
                uid=d.get("uid", ""),
                email=d.get("email", ""),
                display_name=d.get("display_name", ""),
                role=d.get("role", "viewer"),
                workspace_id=d.get("workspace_id", ""),
            )
            for d in docs
        ]
        return {"members": members}
    except Exception as exc:
        log.warning("list_team_failed", error=str(exc))
        return {"members": []}


@auth_router.delete("/team/{uid}")
async def remove_user(uid: str):
    """Remove a user from the team."""
    import firebase_admin
    from firebase_admin import auth

    from src.db.firestore import get_firestore_client

    try:
        auth.delete_user(uid)
        db = get_firestore_client()
        if db:
            db.collection("users").document(uid).delete()

        log.info("user_removed", uid=uid)
        return {"status": "removed", "uid": uid}
    except Exception as exc:
        log.error("remove_user_failed", uid=uid, error=str(exc))
        raise HTTPException(status_code=500, detail=str(exc))

"""Expose authenticated response history through threadpool-safe SQL handlers."""
from typing import Annotated
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.auth.model import User
from app.auth.router import get_token, get_service
from app.auth.service import AuthService
from app.assistant.schema import PromptRequest, Message, History
from app.assistant.service import AssistantService

router = APIRouter(prefix="/api/v1/assistant", tags=["Assistant"])


def current_user(token: Annotated[str, Depends(get_token)],
                 auth: Annotated[AuthService, Depends(get_service)]) -> User:
    """Validate both JWT and persisted revocable session before accessing history."""
    user, _ = auth.authenticate(token)
    return user


@router.post("/messages", response_model=Message, status_code=201, summary="Save a fixed assistant response")
def respond(request: PromptRequest, user: Annotated[User, Depends(current_user)],
            db: Annotated[Session, Depends(get_db)]) -> Message:
    """Store only the response under the authenticated owner."""
    return AssistantService(db).respond(user.id, request)


@router.get("/messages", response_model=History, summary="Read your assistant response history")
def history(user: Annotated[User, Depends(current_user)], db: Annotated[Session, Depends(get_db)],
            limit: Annotated[int, Query(ge=1, le=100)] = 100,
            offset: Annotated[int, Query(ge=0)] = 0) -> History:
    """Return bounded chronological responses without accepting a selected owner."""
    return AssistantService(db).history(user.id, limit, offset)

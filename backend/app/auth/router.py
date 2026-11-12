"""Expose the versioned auth contract through threadpool-safe sync handlers."""
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, Response, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session
from app.auth.schema import Credentials, Account, LoginResponse
from app.auth.service import AuthService, DuplicateUsername, InvalidCredentials
from app.core.database import get_db

router = APIRouter(prefix="/api/v1/auth", tags=["Authentication"])
bearer = HTTPBearer(auto_error=False)


def get_service(request: Request, db: Annotated[Session, Depends(get_db)]) -> AuthService:
    """Inject the app's configuration and one pooled request session."""
    return AuthService(db, request.app.state.settings)


def get_token(credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)]) -> str:
    """Reject absent or non-bearer credentials with the same generic challenge."""
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(401, "Invalid credentials", headers={"WWW-Authenticate": "Bearer"})
    return credentials.credentials


@router.post("/register", response_model=Account, status_code=201, summary="Register an account")
def register(credentials: Credentials, service: Annotated[AuthService, Depends(get_service)]) -> Account:
    """Create an account and report a normalized username conflict as 409."""
    try:
        return service.register(credentials)
    except DuplicateUsername as exc:
        raise HTTPException(409, "Username already exists") from exc


@router.post("/login", response_model=LoginResponse, summary="Start a revocable session")
def login(credentials: Credentials, service: Annotated[AuthService, Depends(get_service)]) -> LoginResponse:
    """Return a signed token only for valid persisted credentials."""
    return service.login(credentials)


@router.get("/me", response_model=Account, summary="Read the authenticated account")
def me(token: Annotated[str, Depends(get_token)], service: Annotated[AuthService, Depends(get_service)]) -> Account:
    """Read identity from the authorized session, never a client-selected owner."""
    user, _ = service.authenticate(token)
    return Account.model_validate(user)


@router.post("/logout", status_code=204, summary="Revoke the current session")
def logout(token: Annotated[str, Depends(get_token)], service: Annotated[AuthService, Depends(get_service)]) -> Response:
    """Retain account data while invalidating the current bearer token."""
    service.logout(token)
    return Response(status_code=204)

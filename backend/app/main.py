"""Initialize the API pool and expose dependency-free process liveness."""
from contextlib import asynccontextmanager
from collections.abc import AsyncIterator
import logging
from pathlib import Path
from alembic import command
from alembic.config import Config
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import sessionmaker
from app.core.config import Settings, get_settings
from app.core.database import build_engine, database_url, provision_database
from app.auth.router import router
from app.assistant.router import router as assistant_router
from app.auth.service import AuthService, InvalidCredentials

logger = logging.getLogger(__name__)


def create_app(settings: Settings | None = None) -> FastAPI:
    """Build a separately deployable API without opening connections at import."""
    configuration = settings or get_settings()

    @asynccontextmanager
    async def lifespan(application: FastAPI) -> AsyncIterator[None]:
        """Provision and migrate before pooling, then dispose on shutdown."""
        await run_in_threadpool(provision_database, configuration)
        await run_in_threadpool(upgrade_database, configuration)
        engine = build_engine(configuration)
        application.state.session_factory = sessionmaker(engine, expire_on_commit=False)
        try:
            if configuration.seed_on_startup:
                await run_in_threadpool(seed_account, application)
            yield
        finally:
            await run_in_threadpool(engine.dispose)

    application = FastAPI(title="Canon CIO API", version="1.0.0",
                          description="Server accounts and revocable sessions.", lifespan=lifespan)
    application.state.settings = configuration
    application.add_middleware(CORSMiddleware, allow_origins=configuration.allowed_origins,
                               allow_methods=["GET", "POST"], allow_headers=["Authorization", "Content-Type"])
    application.include_router(router)
    application.include_router(assistant_router)

    @application.exception_handler(InvalidCredentials)
    async def invalid_credentials(request: Request, exc: InvalidCredentials) -> JSONResponse:
        """Use one generic response for all invalid credential and session cases."""
        return JSONResponse(status_code=401, content={"detail": "Invalid credentials"},
                            headers={"WWW-Authenticate": "Bearer"})

    @application.exception_handler(RequestValidationError)
    async def validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
        """Return field locations without echoing passwords or submitted values."""
        errors = [{"loc": error["loc"], "msg": error["msg"], "type": error["type"]} for error in exc.errors()]
        return JSONResponse(status_code=422, content={"detail": errors})

    @application.exception_handler(SQLAlchemyError)
    async def database_error(request: Request, exc: SQLAlchemyError) -> JSONResponse:
        """Fail visibly without exposing queries, credentials or internal traces."""
        logger.error("Database operation failed")
        return JSONResponse(status_code=503, content={"detail": "Service unavailable"})

    @application.exception_handler(Exception)
    async def unexpected_error(request: Request, exc: Exception) -> JSONResponse:
        """Return a safe failure without logging credential-bearing exception details."""
        logger.error("Unexpected API operation failure")
        return JSONResponse(status_code=500, content={"detail": "Internal server error"})

    @application.get("/api/health", tags=["Health"], summary="Check process liveness")
    def health() -> dict[str, str]:
        """Report process liveness independently of database availability."""
        return {"status": "ok"}

    return application


def upgrade_database(configuration: Settings) -> None:
    """Apply reviewed migrations to this app's database without changing the environment."""
    migration_config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    migration_config.attributes["database_url"] = database_url(configuration)
    command.upgrade(migration_config, "head")


def seed_account(application: FastAPI) -> None:
    """Seed development credentials only when explicitly enabled."""
    with application.state.session_factory() as db:
        AuthService(db, application.state.settings).seed()


app = create_app()

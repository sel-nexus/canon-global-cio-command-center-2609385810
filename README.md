# Canon Global CIO Command Center

React/Vite executive dashboard with a FastAPI/PostgreSQL backend for accounts, revocable sessions, and per-user deterministic assistant response history. Seven dashboard views remain illustrative: missing metric values are **Not specified**, and undefined export/predictive/action controls do not perform invented workflows.

## Run with Docker Compose
1. Copy `backend/.env.example` to `backend/.env`.
2. Replace `JWT_SECRET` and database credentials for any nonlocal environment. The example values are development-only.
3. Run `docker compose up --build -d` from the repository root.
4. Open `http://localhost:8080` (override `FRONTEND_PORT`). Register a new account, then log in. No account is automatically seeded unless explicitly enabled.

Compose starts nginx frontend, FastAPI backend and PostgreSQL 16 with a named volume. Startup provisions the configured `DB_NAME` using the maintenance `DATABASE_URL` and applies Alembic migrations. `/api/health` is backend process liveness; `/` serves the frontend. nginx forwards `/api/` to the backend service.

## Run without Docker
Backend (Python 3.12): create a fresh virtual environment outside this repository, install `backend/requirements.txt`, copy the backend environment example, and provide a running PostgreSQL server. From `backend`: `python -m uvicorn app.main:app --host 0.0.0.0 --port 8000`. Configure maintenance credentials with database-creation privileges; use separate least-privilege runtime credentials and TLS in a reviewed production deployment.

Frontend (Node 20+): from `frontend`, run `npm ci`, copy `.env.example` to `.env`, set `API_PROXY_TARGET` to the backend development address, then `node node_modules/vite/bin/vite.js --host 0.0.0.0`. API requests default to same origin; no localhost API address is embedded in the production client.

## Verification commands
- Frontend: from `frontend`, `node node_modules/vitest/vitest.mjs run`.
- Build: from `frontend`, `node node_modules/vite/bin/vite.js build`.
- Backend: from `backend`, `PYTHONPATH=. python -m pytest -q`. Tests create a unique test database, migrate it, and clean it up. `TEST_DATABASE_URL` must point to a PostgreSQL maintenance database with test database creation rights.
- Browser: from `frontend`, `TEST_DATABASE_URL=<maintenance-url> node node_modules/@playwright/test/cli.js test --config playwright.config.cjs`. Install the matching Chromium once with `node node_modules/@playwright/test/cli.js install chromium`. The config starts real API/preview servers and a separate synthetic chart harness, then drops its isolated browser database.
- Sandbox recovery helper: `python3 verify-postgres.py` owns the local PostgreSQL process while running backend tests. It is sandbox-specific, not the production startup path.

## APIs and persistence
`POST /api/v1/auth/register`, `POST /api/v1/auth/login`, `GET /api/v1/auth/me`, `POST /api/v1/auth/logout`; authenticated `POST /api/v1/assistant/messages` and `GET /api/v1/assistant/messages?limit=100&offset=0`. OpenAPI is available at `/docs`. Passwords are SHA-256 preprocessed then salted bcrypt hashed; signed JWTs are checked against persisted session ownership, expiry and revocation. Only fixed assistant responses are stored, not entered prompts. Browser-only prototype credentials are not trusted or automatically migrated.

## Verified outcome and remaining limits
- 343 frontend tests passed; 126 backend tests passed against real PostgreSQL, including integration, startup and migration behavior.
- Independent fullstack test critic passed at 0.981651 with zero high failures. Its medium three-domain integration requirement is inapplicable to this approved two-domain product; substantive two-domain chains passed.
- Frontend build and `docker compose up --build -d` passed, with backend/database healthy.
- **E2E journeys did not complete**: corrected browser runs repeatedly lost sandbox execution. The human approved proceeding with this explicit verification warning. Browser behavior, timings, chart lifecycle runtime and updated fullstack preflight remain unverified. Existing preflight screenshots/text are historical frontend-only evidence, not current fullstack acceptance.
- Container npm install reported 9 vulnerabilities (3 moderate, 4 high, 2 critical). Dependency remediation/security release review is outstanding; do not deploy publicly as production-cleared software. No automated breaking upgrades were applied.
- Local build produced a chunk-size warning. AWS edge/device performance and deployment are not verified by this stage.

This application does not provide enterprise SSO, RBAC, live enterprise metrics, generative AI, telemetry transmission, password recovery, or security certification. Use synthetic data during evaluation. Production rollout requires credential rotation, HTTPS/TLS, dependency remediation, abuse controls, and completion of browser/security acceptance.

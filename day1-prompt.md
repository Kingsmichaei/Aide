Read CLAUDE.md first. Today is Day 1: foundations only. Don't add any sponsor integrations yet.

Set up the repo as described in CLAUDE.md, in this order. Stop after each step, run the checks, and tell me what you did before moving on.

1. **Back end skeleton** in `backend/`:
   - FastAPI app with a `GET /health` endpoint that returns `{"status": "ok"}`
   - `config.py` reading settings from environment variables (pydantic-settings)
   - SQLAlchemy 2 setup with Postgres and Alembic configured
   - All seven tables from the data model, with a first Alembic migration
   - CORS allowing `FRONTEND_URL`
   - ruff + pytest configured, with one passing test for `/health`

2. **Front end skeleton** in `frontend/`:
   - React + Vite + TypeScript (strict) + Tailwind + React Router
   - Two routes: `/shop` with one large "Talk to Aide" button (at least 64 px tall, 20 px base text), and `/care` with a placeholder heading
   - An API client in `src/lib/api.ts` that calls `/health` and shows the result on both pages
   - eslint, prettier and vitest configured

3. **Config and deploy**:
   - `.env.example` with every key listed in CLAUDE.md, and `.env` in `.gitignore`
   - `render.yaml` defining a Python web service (backend), a static site (frontend) and a Postgres database
   - A short README: how to run both parts locally and how to deploy to Render

4. **Final check**: run all tests and linters, then list anything I need to do by hand, such as creating accounts or adding environment variables in the Render dashboard.

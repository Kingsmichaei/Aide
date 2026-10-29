# Aide

Your AI personal shopper: it finds it, watches the price, and buys with PayPal when you say yes.

Tell Aide what you want in plain words, in English, Spanish, French or Arabic, typed or spoken. It searches thousands of retailers through Channel3, shows at most three options with a short reason each, and pays through PayPal only after you confirm the exact total. You set your own spending rules (a monthly budget, an "ask me first above" amount and blocked categories), and Aide warns you before a purchase would break one.

Built for the PayPal AI Hackathon 2026. All payments run in the PayPal **sandbox**.

- `backend/`: FastAPI, SQLAlchemy 2, Alembic. SQLite for local development, Postgres on Render.
- `frontend/`: React, Vite, TypeScript, Tailwind CSS, shadcn/ui, TanStack Query, React Router.

## How a purchase works

1. You ask; the agent searches Channel3 and replies with up to three product cards.
2. You tap **Buy** (or say yes). Checkout shows the item, store, price, delivery and total.
3. The server re-checks the live price (a change over 5% means asking again) and your spending rules. A rule warning needs a second, explicit yes.
4. The server creates a PayPal order with `intent: AUTHORIZE`; you approve in PayPal.
5. The server authorizes and captures. Every state change is logged on the order.

The model can draft orders but can never move money: authorize, capture and void run only in server code, never as agent tools.

## Run locally

### Prerequisites

- [uv](https://docs.astral.sh/uv/) (installs Python 3.12 for you)
- Node.js 22.22+ or 24.15+

### Environment

```sh
cp backend/.env.example backend/.env    # back end
cp frontend/.env.example frontend/.env  # front end
```

The defaults work for local development. The back end stores its data in a SQLite file, `backend/aide.db`, so you don't need to install a database. To develop against Postgres instead, set `DATABASE_URL=postgresql://user:password@localhost:5432/aide`. The back end reads `backend/.env` and the repo-root `.env`. The front end reads only `frontend/.env`, and Vite builds those `VITE_*` values into the bundle, so never put secrets there.

The front end calls the API at `/api` on its own origin. In development, Vite forwards `/api` to `http://localhost:8000`; on Render, a rewrite rule does the same. Keeping one origin lets the sign-in cookie be HTTP-only and first-party. Leave `VITE_API_URL` unset.

To shop end to end you also need:

| Key | Where to get it |
| --- | --- |
| `LLM_API_KEY` | A Gemini API key from Google AI Studio (`LLM_PROVIDER=gemini`) |
| `CHANNEL3_API_KEY` | Your Channel3 dashboard |
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` | developer.paypal.com → Apps & Credentials → **Sandbox** → your app |
| `VITE_PAYPAL_CLIENT_ID` (in `frontend/.env`) | The same sandbox client id as `PAYPAL_CLIENT_ID` |
| `SECRET_KEY` | Optional locally: any long random string. Without it you are signed out whenever the back end restarts. |

### Back end (http://localhost:8000)

```sh
cd backend
uv sync
uv run alembic upgrade head
uv run python -m app.seed   # demo users Maya and Leo
uv run uvicorn app.main:app --reload
```

The seed is safe to run again. **Maya Chen** has spending rules ($600 a month, ask first above $150) and 14 paid orders over the last two months in five categories. **Leo Martin** is a brand-new user with nothing yet. Seeded orders use made-up PayPal ids (`DEMO-...`), so they can't be captured or refunded in the sandbox; place a new order to demo paying.

Check it: <http://localhost:8000/health> should return `{"status":"ok"}`.

Tests, types and lint:

```sh
uv run pytest
uv run mypy
uv run ruff check .
uv run ruff format --check .
```

Code layout: `routers/` only translate HTTP, `services/` hold the business logic (no FastAPI imports), and `integrations/` are thin clients for PayPal, Channel3 and the LLM. `core/` has configuration, the database session, sign-in, errors and logging; `schemas/` has the API's request and response models. `tests/` mirrors `app/`, and every external API is faked in tests.

### Front end (http://localhost:5173)

```sh
cd frontend
npm install
npm run dev
```

Open <http://localhost:5173/signin> and choose Maya or Leo. This demo has no passwords; the choice is kept in an HTTP-only cookie, and every request acts only for the signed-in user.

Tests, lint and build:

```sh
npm test
npm run lint
npm run format:check
npm run build
```

The design tokens (colours, radius, spacing, shadows, light and dark) live in `frontend/src/styles/tokens.css` and are mapped to Tailwind in `frontend/src/styles/index.css` (Tailwind 4 reads its theme from CSS, so there is no `tailwind.config` file). UI primitives are shadcn/ui components in `frontend/src/components/ui/`.

### Database migrations

After changing a model in `backend/app/models/`:

```sh
cd backend
uv run alembic revision --autogenerate -m "describe the change"
uv run alembic upgrade head
```

Look over the generated file before you commit it. On SQLite, Alembic uses batch mode, which rebuilds a table to change a column. Postgres runs the same migration on deploy, so keep migrations to portable column types.

To start again with an empty local database, delete `backend/aide.db` and run `uv run alembic upgrade head` and `uv run python -m app.seed`.

## Deploy to Render

`render.yaml` is a Render Blueprint that defines three resources:

| Name | Type | What it is |
| --- | --- | --- |
| `aide-api` | Python web service | The FastAPI back end. It runs migrations, then starts uvicorn. |
| `aide-web` | Static site | The built front end. `/api/*` is forwarded to `aide-api`; every other path falls back to `index.html`. |
| `aide-db` | Postgres | The database, reachable only from inside Render. |

1. Push the repo to GitHub.
2. In the Render Dashboard choose **New → Blueprint** and select the repo.
3. Render asks for every variable marked `sync: false`. Use these values:
   - `FRONTEND_URL`: `https://aide-web.onrender.com`, or whatever URL Render gives the static site. Leave off the trailing slash.
   - The sponsor and LLM keys. These can stay blank until the features that use them exist.
4. Click **Apply**. Render generates `SECRET_KEY` for you. If Render gave the API a URL other than `https://aide-api.onrender.com`, change the `/api/*` rewrite in `render.yaml` (or in the static site's **Redirects/Rewrites** settings). If the static site's URL differs, update `FRONTEND_URL`.
5. Sign in on the deployed site and check that you stay signed in after a reload. If you don't, the rewrite is not passing the cookie: see the note on `COOKIE_SAMESITE` in `backend/app/core/config.py`.

Free-plan notes:

- The free web service sleeps after 15 minutes without traffic, so the first request afterwards is slow. Open `/health` before a demo.
- The free Postgres database expires 30 days after it is created. Upgrade it, or create it close to the judging dates.
- Pre-deploy commands need a paid plan. That is why migrations run in the start command.

# Aide

A voice-first AI shopping assistant for people online shopping leaves behind. The shopper says what they need, Aide finds it, reads back the total and pays through PayPal only after the shopper confirms. A caregiver sets spending limits and approves anything above them.

Built for the PayPal AI Hackathon 2026. All payments run in the PayPal **sandbox**.

- `backend/`: FastAPI, SQLAlchemy 2, Alembic, Postgres
- `frontend/`: React, Vite, TypeScript, Tailwind, React Router. `/shop` is the shopper app and `/care` is the caregiver dashboard.

## Run locally

### Prerequisites

- [uv](https://docs.astral.sh/uv/) (installs Python 3.12 for you)
- Node.js 22.22+ or 24.15+
- Postgres 16+, either installed locally or run with Docker:

  ```sh
  docker run --name aide-db -e POSTGRES_USER=aide -e POSTGRES_PASSWORD=aide -e POSTGRES_DB=aide -p 5432:5432 -d postgres:18
  ```

### Environment

```sh
cp .env.example .env                    # back end
cp frontend/.env.example frontend/.env  # front end
```

The defaults work for local development with the Docker database above. The back end reads `backend/.env` and the repo-root `.env`. The front end reads only `frontend/.env`, and Vite builds those `VITE_*` values into the bundle, so never put secrets there.

To shop end to end you also need:

| Key | Where to get it |
| --- | --- |
| `LLM_API_KEY` | A Gemini API key from Google AI Studio (`LLM_PROVIDER=gemini`) |
| `CHANNEL3_API_KEY` | Your Channel3 dashboard |
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` | developer.paypal.com → Apps & Credentials → **Sandbox** → your app |
| `VITE_PAYPAL_CLIENT_ID` (in `frontend/.env`) | The same sandbox client id as `PAYPAL_CLIENT_ID` |

### Back end (http://localhost:8000)

```sh
cd backend
uv sync
uv run alembic upgrade head
uv run python -m app.seed   # demo shopper (Rosa, $100 per-order limit) and caregiver (Sam)
uv run uvicorn app.main:app --reload
```

The seed script prints the shopper's id. If it is not `1`, set `VITE_DEMO_SHOPPER_ID` in `frontend/.env`.

Check it: <http://localhost:8000/health> should return `{"status":"ok"}`.

Tests and lint:

```sh
uv run pytest
uv run ruff check .
uv run ruff format --check .
```

### Front end (http://localhost:5173)

```sh
cd frontend
npm install
npm run dev
```

Open <http://localhost:5173/shop> or <http://localhost:5173/care>. Each page shows whether it can reach the API.

Tests, lint and build:

```sh
npm test
npm run lint
npm run format:check
npm run build
```

### Database migrations

After changing a model in `backend/app/models/`:

```sh
cd backend
uv run alembic revision --autogenerate -m "describe the change"
uv run alembic upgrade head
```

## Deploy to Render

`render.yaml` is a Render Blueprint that defines three resources:

| Name | Type | What it is |
| --- | --- | --- |
| `aide-api` | Python web service | The FastAPI back end. It runs migrations, then starts uvicorn. |
| `aide-web` | Static site | The built front end. All paths fall back to `index.html`. |
| `aide-db` | Postgres | The database, reachable only from inside Render. |

1. Push the repo to GitHub.
2. In the Render Dashboard choose **New → Blueprint** and select the repo.
3. Render asks for every variable marked `sync: false`. Use these values:
   - `FRONTEND_URL`: `https://aide-web.onrender.com`, or whatever URL Render gives the static site. Leave off the trailing slash.
   - `VITE_API_URL`: `https://aide-api.onrender.com`, or the API's URL.
   - The sponsor and LLM keys. These can stay blank until the features that use them exist.
4. Click **Apply**. If Render gave either service a different URL, update `FRONTEND_URL` and `VITE_API_URL`. Then redeploy `aide-web`, because Vite builds `VITE_API_URL` into the bundle.

Free-plan notes:

- The free web service sleeps after 15 minutes without traffic, so the first request afterwards is slow. Open `/health` before a demo.
- The free Postgres database expires 30 days after it is created. Upgrade it, or create it close to the judging dates.
- Pre-deploy commands need a paid plan. That is why migrations run in the start command.

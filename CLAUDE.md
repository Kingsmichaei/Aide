# Aide — project brief for Claude Code

Aide is a voice-first AI shopping assistant for people that online shopping leaves behind: older adults, blind and low-vision users, people with motor or cognitive disabilities, and non-native speakers. The shopper says what they need in any language. Aide finds it, explains it simply, reads back the total, and pays through PayPal only after the shopper confirms. A caregiver sets spending limits and approves anything above them.

Built for the PayPal AI Hackathon 2026 (Devpost). Deadline: Nov 12, 2026, 2:00 pm PT. All payments run in PayPal **sandbox**.

## Stack

- **Back end:** Python 3.11+, FastAPI, SQLAlchemy 2 + Alembic, Postgres, httpx, pytest
- **Front end:** React + Vite + TypeScript, Tailwind CSS, React Router
- **AI:** an LLM API with tool calling (provider set by `LLM_PROVIDER` env var)
- **Voice:** browser Web Speech API (speech to text and text to speech), text input always available
- **Sponsors:**
  - PayPal: Orders REST API (we call it directly for the payment flow) + PayPal Agent Toolkit for read-only and refund tools
  - Channel3: product search (`POST /v1/search`), product detail, find-similar
  - Kernel: cloud browser + Playwright execute, for reading retailer pages
  - AG Grid (React): caregiver orders ledger and charts
  - Bryntum Calendar (React): recurring orders and deliveries
  - Render: hosting (web service, static site, Postgres) + Render Workflows for background jobs
  - APIMatic Context Plugin: PayPal API context while coding
- Before using any sponsor SDK, check its current docs for the exact package name and method signatures. Do not guess APIs.

## Repo layout

```
aide/
  CLAUDE.md
  render.yaml
  backend/
    app/
      main.py            # FastAPI app, routers
      config.py          # settings from env
      db.py              # engine, session
      models/            # SQLAlchemy models
      routers/           # shopper, caregiver, orders, webhooks
      agent/             # agent loop, tool definitions, prompts
      services/          # paypal.py, channel3.py, kernel.py, limits.py
      workflows/         # Render Workflows tasks
    alembic/
    tests/
    pyproject.toml
  frontend/
    src/
      routes/shop/       # shopper app
      routes/care/       # caregiver dashboard
      components/
      lib/               # api client, speech helpers
    package.json
```

One front end with two areas: `/shop` (shopper) and `/care` (caregiver).

## Non-negotiable rules

### Payments (the trust story; never weaken these)

1. The model can **draft** an order but can never move money. Capture and void are server-only functions. They are never exposed as agent tools, and the PayPal Agent Toolkit allowlist excludes them.
2. Orders are created with `intent: AUTHORIZE`. Flow: draft → shopper confirms → PayPal order created → shopper approves in PayPal → server authorizes → server checks limits → capture, or set `awaiting_caregiver`.
3. The shopper's confirmation is stored with the exact item, price, currency and total it was given for. If any of these change, ask again.
4. Re-check the price just before creating the PayPal order. A change over 5% means asking the shopper again.
5. Caregiver approve → capture. Decline → void, then tell the shopper kindly.
6. Never repeat a payment silently. Recurring orders always ask the shopper to confirm.
7. Log every state change in `orders` and `approvals`.

### Agent

- Tools: `search_products`, `compare_offers`, `find_cheaper`, `check_retailer_page`, `propose_order`, `create_paypal_order` (only after a recorded confirmation), `track_shipment`, `request_refund` (needs confirmation), `schedule_recurring` (needs confirmation).
- Blocked categories are filtered out of search results before the model sees them.
- Reply in the shopper's language, short sentences, about a 6th-grade reading level.
- At most three options at a time. Always state the full price including delivery before asking to buy.
- Keep tool functions small, typed and unit-tested, with sponsor calls mocked in tests.

### Accessibility (target WCAG 2.2 AA)

- Shopper app: one primary action per screen; "Talk to Aide" button at least 64 px tall; base text 20 px, adjustable to 32 px; body text contrast at least 7:1.
- Everything works by voice, keyboard and screen reader. Use semantic HTML first, ARIA only when needed. Every control has an accessible name.
- Every spoken reply also shows as text, with replay and slower-voice controls.
- No timeouts in checkout, no carousels, no auto-playing motion; respect `prefers-reduced-motion`.
- Support right-to-left languages (`dir="rtl"`).
- Status colours are always paired with a word.
- Caregiver dashboard: calm, data-dense, light and dark themes.

## Data model

| Table | Key fields |
| --- | --- |
| users | id, name, role (shopper/caregiver), language, voice_speed, text_size, address |
| care_links | shopper_id, caregiver_id, status |
| limits | shopper_id, per_order_max, monthly_max, currency, blocked_categories |
| conversations | id, shopper_id, language, messages (JSON) |
| orders | id, shopper_id, channel3_product_id, title, retailer, price, currency, confirmed_total, paypal_order_id, paypal_auth_id, status, created_at |
| approvals | order_id, caregiver_id, decision, note, decided_at |
| recurring_orders | id, shopper_id, channel3_product_id, every_days, next_date, max_price |

Order status values: `draft`, `awaiting_shopper`, `awaiting_caregiver`, `captured`, `voided`, `refunded`.

Product data stays in Channel3. Store its product ID, not a copy of the product.

## Environment variables

Keep secrets in `.env` (git-ignored) and list every key in `.env.example`:

```
DATABASE_URL=
LLM_PROVIDER=
LLM_API_KEY=
PAYPAL_CLIENT_ID=
PAYPAL_CLIENT_SECRET=
PAYPAL_ENVIRONMENT=SANDBOX
CHANNEL3_API_KEY=
KERNEL_API_KEY=
RENDER_API_KEY=
FRONTEND_URL=
```

## How to work in this repo

- Work in small, testable steps. After each step: run the tests, run the linter, and summarise what changed.
- Back end: `ruff` for lint and format, `pytest` for tests. Front end: `eslint`, `prettier`, `vitest`.
- Type everything: Pydantic models for requests and responses, TypeScript strict mode.
- Never commit secrets. Never call production PayPal.
- Ask before adding a new dependency or changing the data model.
- When unsure how a sponsor API works, read its docs first and say what you checked.

## Build order

1. Foundations: repo, skeletons, Postgres, Render deploy
2. Core flow: agent loop, Channel3 search, PayPal authorize/capture, text chat
3. Voice and languages
4. Caregiver limits, approvals, AG Grid dashboard
5. Kernel page checks, find_cheaper, Bryntum calendar, Render Workflows
6. Accessibility pass, demo data, polish
7. Demo video, README, Devpost submission

**Never cut:** spoken confirmation before payment, caregiver approval path, AG Grid dashboard, accessibility checks.

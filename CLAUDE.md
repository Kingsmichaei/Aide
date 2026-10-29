# Aide — project brief for Claude Code

Aide is an AI personal shopper for everyone. You tell it what you want in plain words, in any language. It searches thousands of retailers, compares options, checks live prices and stock, and buys through PayPal when you say yes. It can watch a product and set up checkout when the price drops to your target. You set your own spending rules, and Aide respects them.

Built for the PayPal AI Hackathon 2026 (Devpost). Deadline: Nov 12, 2026, 2:00 pm PT. All payments run in PayPal **sandbox**.

**One-line pitch:** Your AI personal shopper: it finds it, watches the price, and buys with PayPal when you say yes.

## Product pillars

1. **Chat shopping:** ask in plain words, get at most three options with a short reason each, buy with one tap.
2. **Price Watch:** "tell me when this drops under $150". Aide checks the price on a schedule and, when the target is hit, prepares checkout and notifies you. You approve with one tap.
3. **Spending rules:** a monthly budget, an "ask me first above $X" amount, and blocked categories. Aide warns you before a purchase would break a rule.
4. **Orders and insights:** every order, refund and price watch in one dashboard, with "ask about your spending" answered as charts.
5. **Planner:** a calendar of deliveries, price-watch deadlines and dates you care about (birthdays, trips).

There is one kind of user. There is no caregiver role and no second approver.

## Stack

- **Back end:** Python 3.11+, FastAPI, SQLAlchemy 2 + Alembic, httpx, Pydantic v2, pytest
- **Database:** SQLite for local development (no Docker, no local Postgres needed); Postgres on Render in production. Write portable SQLAlchemy only; use Alembic batch mode so migrations run on SQLite.
- **Front end:** React + Vite + TypeScript (strict), Tailwind CSS, React Router, shadcn/ui components (Radix-based), lucide-react icons, TanStack Query for server state
- **AI:** an LLM API with tool calling (provider set by `LLM_PROVIDER`)
- **Voice:** optional input with the browser Web Speech API; text is the primary input
- **Sponsors:**
  - PayPal: Orders REST API for the payment flow (authorize, then capture on the server) + PayPal Agent Toolkit for shipment tracking, refunds and transaction search
  - Channel3: product search, product detail, find-similar, offers across retailers
  - Kernel: cloud browser + Playwright execute, for live price, stock and delivery checks on retailer pages
  - AG Grid + AG Charts (React): orders ledger and spending insights
  - Bryntum Calendar (React): the planner
  - Render: hosting (web service, static site, Postgres) + Render Workflows for price-watch checks and reminders
  - APIMatic Context Plugin: PayPal API context while coding
- Before using any sponsor SDK, check its current docs for exact package names and method signatures. Do not guess APIs.

## Repo layout

```
aide/
  CLAUDE.md
  render.yaml
  backend/
    app/
      main.py              # app factory, router registration
      core/                # config, db session, security, logging, errors
      models/              # SQLAlchemy models, one file per aggregate
      schemas/             # Pydantic request/response models
      routers/             # chat, products, orders, watches, rules, insights, planner
      services/            # business logic; no FastAPI imports here
      integrations/        # paypal.py, channel3.py, kernel.py, llm.py (thin clients only)
      agent/               # loop.py, tools.py, prompts.py
      workflows/           # Render Workflows tasks
    alembic/
    tests/                 # mirrors app/ structure
    pyproject.toml
  frontend/
    src/
      app/                 # router, providers, app shell
      features/            # shop, watches, orders, planner, settings (each: components, hooks, api)
      components/ui/       # shadcn/ui primitives
      components/          # shared composed components
      lib/                 # api client, formatting, speech helpers
      i18n/
      styles/
    package.json
```

Layering: routers call services, services call integrations and the database, integrations only talk to external APIs. No business logic in routers or React components.

## Non-negotiable rules

### Payments

1. The model can draft orders and propose purchases, but it can never move money. Authorize, capture, void and refund calls run only in server services, never as agent tools. The PayPal Agent Toolkit allowlist excludes capture and void.
2. Flow: draft → user confirms (button or clear spoken yes) → server re-checks price and rules → PayPal order with `intent: AUTHORIZE` → user approves in PayPal → server authorizes and captures.
3. The confirmation is stored with the exact title, price, currency and total shown to the user. If any of these change, ask again.
4. Re-check the price just before creating the PayPal order. A change over 5% means asking again.
5. Spending rules: if a purchase is above the user's "ask me first" amount or would exceed the monthly budget, show a clear warning and require an extra confirmation. Blocked categories never appear in results.
6. Price Watch never pays on its own. When a target is hit, it prepares the order and notifies the user, who approves with one tap.
7. Every order state change is logged with a timestamp.

Order status values: `draft`, `confirmed`, `awaiting_payment`, `authorized`, `captured`, `voided`, `refunded`, `failed`.

### Agent

- Tools: `search_products`, `compare_offers`, `find_cheaper`, `check_live_price` (Kernel), `propose_order`, `create_price_watch`, `track_shipment`, `request_refund` (needs confirmation).
- Reply in the user's language, in short, friendly sentences.
- At most three options at a time. Always state the full price including delivery before asking to buy.
- Tool functions are small, typed and unit-tested, with external calls mocked.

## Data model

| Table | Key fields |
| --- | --- |
| users | id, name, email, language, currency, theme |
| spending_rules | user_id, monthly_budget, ask_above, blocked_categories |
| conversations | id, user_id, language, messages (JSON) |
| orders | id, user_id, channel3_product_id, title, retailer, price, currency, confirmed_total, confirmation_method, paypal_order_id, paypal_auth_id, status, created_at |
| order_events | order_id, from_status, to_status, note, created_at |
| price_watches | id, user_id, channel3_product_id, title, target_price, currency, status, last_price, last_checked_at, expires_at |
| notifications | id, user_id, kind, payload (JSON), read_at, created_at |
| planner_events | id, user_id, kind (delivery, watch_deadline, personal), title, starts_at, ends_at, order_id, watch_id |

Product data stays in Channel3. Store its product ID, not a copy.

## Design system

The UI must look like a funded consumer product, not a hackathon demo.

- **Look:** clean and calm, generous white space, neutral greys with one accent colour (deep indigo). No gradients behind text, no emoji in the UI, no stock illustrations.
- **Type:** Inter, loaded from Google Fonts. Body 15–16 px, page titles 28–32 px, tabular numbers for prices.
- **Tokens:** colours, radius, spacing and shadows defined once as CSS variables in `styles/tokens.css` and mapped in `tailwind.config`. Light and dark themes.
- **Components:** use shadcn/ui primitives (Button, Card, Input, Dialog, Sheet, Tabs, Badge, Toast, Skeleton). Don't hand-roll what these provide.
- **App shell:** left sidebar on desktop (Shop, Watches, Orders, Planner, Settings), bottom tab bar on mobile. Chat is the home screen.
- **Product card:** image, title, retailer, price, one-line reason, "Buy" and "Watch price" actions.
- **States:** every screen has loading (skeletons), empty and error states written in plain words.
- **Baseline quality:** responsive from 360 px wide, keyboard usable, visible focus rings, labelled controls, good contrast. This is standard quality, not a separate feature.

## Environment variables

Keep secrets in `.env` (git-ignored) and list every key in `.env.example`:

```
DATABASE_URL=sqlite:///./aide.db
LLM_PROVIDER=
LLM_API_KEY=
PAYPAL_CLIENT_ID=
PAYPAL_CLIENT_SECRET=
PAYPAL_ENVIRONMENT=SANDBOX
CHANNEL3_API_KEY=
KERNEL_API_KEY=
RENDER_API_KEY=
AG_GRID_LICENSE_KEY=
BRYNTUM_LICENSE=
FRONTEND_URL=http://localhost:5173
```

## Code quality

- Clear names, small functions, one responsibility per module. Prefer composition and reuse over copy-paste.
- Type everything: Pydantic schemas on the API, TypeScript strict, no `any`.
- Central error handling: typed service errors mapped to HTTP responses in one place.
- Configuration only through `core/config.py`; no `os.environ` reads elsewhere.
- Tests for every service and agent tool. External APIs are always mocked in tests.
- Back end: `ruff` (lint and format), `mypy`, `pytest`. Front end: `eslint`, `prettier`, `vitest`.
- Work in small, testable steps. After each step: run tests and linters, then summarise what changed.
- Ask before adding a dependency or changing the data model. Never commit secrets. Never call production PayPal.

## Build order

1. Done: foundations, core purchase flow, voice and languages, dashboard groundwork
2. Day 5: reshape to the new product (remove caregiver), design system and app shell
3. Day 6: Price Watch (Channel3 + Kernel + Render Workflows) and notifications
4. Day 7: Orders and insights (AG Grid + AG Charts), planner (Bryntum)
5. Then: polish, demo data, demo video, README, Devpost submission

**Never cut:** confirmation before payment, server-side capture, Price Watch, the AG Grid dashboard.u
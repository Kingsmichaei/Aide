Read CLAUDE.md first. Today is Day 2: the core shopper flow in text (no voice yet). By the end, a shopper can type a request, pick a product, confirm, and pay in PayPal sandbox.

Work in the steps below. Stop after each one, run the tests and linter, and tell me what you did before moving on. Before using Channel3 or PayPal, read their current docs and tell me which endpoints and SDK methods you checked.

1. **Channel3 service** (`backend/app/services/channel3.py`):
   - `search_products(query, max_price=None, limit=5)` returning a small typed result: product id, title, image URL, best offer (price, currency, retailer, URL)
   - `get_product(product_id)` and `find_similar(product_id, limit=5)`
   - Filter out the shopper's blocked categories before results leave this service
   - Unit tests with the HTTP calls mocked

2. **PayPal service** (`backend/app/services/paypal.py`), sandbox only:
   - OAuth access token with caching until expiry
   - `create_order(order)` using `intent: AUTHORIZE`, with item, amount and currency from our stored order
   - `authorize(paypal_order_id)`, `capture(auth_id)`, `void(auth_id)`
   - These are server-only functions. Do not register any of them as agent tools.
   - Unit tests with the HTTP calls mocked

3. **Limits service** (`backend/app/services/limits.py`):
   - `check(shopper_id, amount, currency)` returning `within_limit` or `needs_caregiver`, using per-order and monthly limits from the `limits` table
   - Tests for: under limit, over per-order limit, over monthly limit, no limits set

4. **Order endpoints** (`backend/app/routers/orders.py`):
   - `POST /orders/draft`: create a draft from a Channel3 product id
   - `POST /orders/{id}/confirm`: store the shopper's confirmation with the exact title, price, currency and total. Re-check the price through Channel3 first; if it changed by more than 5%, return the new price and don't confirm.
   - `POST /orders/{id}/paypal`: only for confirmed orders; creates the PayPal order and returns its id
   - `POST /orders/{id}/approved`: called after the shopper approves in PayPal. Authorize, run the limits check, then capture or set `awaiting_caregiver`.
   - Every status change is written to the order with a timestamp
   - Tests covering the full happy path and the over-limit path

5. **Agent loop** (`backend/app/agent/`):
   - A provider-agnostic loop with tool calling, using `LLM_PROVIDER` and `LLM_API_KEY`
   - Tools for today: `search_products`, `compare_offers`, `find_cheaper`, `propose_order`. The agent can draft orders but cannot confirm, create PayPal orders, capture or void.
   - System prompt following the agent rules in CLAUDE.md: shopper's language, short sentences, at most three options, full price stated before asking to buy
   - `POST /chat` taking `shopper_id` and a message, saving the conversation, and returning the reply text plus structured data (product cards, a draft order if one was proposed)
   - Tests with the LLM mocked: one search turn, one turn that proposes an order

6. **Shopper chat screen** (`frontend/src/routes/shop/`):
   - A text chat: message list, large input, large send button
   - Product cards with image, name, price, retailer and a "Choose this" button
   - A confirmation panel that shows the item, total and delivery, with a large "Yes, buy it" button that calls `/confirm`
   - PayPal JS SDK buttons (sandbox client id from env) that call `/orders/{id}/paypal` to create and `/orders/{id}/approved` on approval
   - A clear result message: "Paid" or "Sent to your caregiver for approval"
   - Accessibility from CLAUDE.md: semantic HTML, labels on every control, keyboard usable, focus moves to new messages, live region announcing replies
   - Seed script with one shopper (limit $100 per order) and one caregiver

7. **Final check**: run all tests and linters, then walk me through one manual test in sandbox (what to type, which sandbox buyer account to log in with, what should happen). List anything I need to do by hand, such as adding API keys.
Read CLAUDE.md first. Today is Day 4: caregiver controls and the AG Grid dashboard. By the end, a caregiver can set limits, get an alert for an over-limit order, approve or decline it, and see all spending in a professional dashboard.

Work in the steps below. Stop after each one, run the tests and linter, and tell me what you did before moving on. Before using AG Grid or AG Charts, read their current React docs and tell me which features are free (Community) and which need the trial licence (Enterprise / AG Studio).

1. **Demo sign-in**:
   - Simple session sign-in for the seeded users (no passwords for the demo; a "Sign in as" picker with the seeded shopper and caregiver), stored in an HTTP-only cookie
   - `/care` routes require a caregiver linked to the shopper through `care_links`; return 403 otherwise
   - Tests for the access rules

2. **Limits**:
   - `GET` and `PUT /care/shoppers/{id}/limits` for per-order max, monthly max, currency and blocked categories
   - A limits form in `/care` with clear labels, help text, and validation (positive numbers, monthly max at least the per-order max)
   - Blocked categories chosen from Channel3 categories, not free text

3. **Approval flow** (follow the payment rules in CLAUDE.md exactly):
   - `GET /care/approvals` listing orders in `awaiting_caregiver`, with item, price, retailer, the shopper's confirmation transcript and a one-sentence AI summary ("She asked for cheaper vitamins; this is $4 less than last month")
   - `POST /care/approvals/{order_id}` with `approve` or `decline` and an optional note. Approve → capture; decline → void. Write an `approvals` row either way.
   - Read the PayPal docs on how long an authorization stays valid. If it has expired when the caregiver approves, don't capture: set the order back to `awaiting_shopper` and tell both people in plain words.
   - Approving twice or approving a voided order must fail safely
   - Tests: approve, decline, double approve, expired authorization

4. **Alerts and live status**:
   - In-app notifications for caregivers (a notifications table; add a migration and tell me first), shown as a badge and a list
   - Server-sent events (or polling every 10 seconds if simpler) so the caregiver's approval queue and the shopper's order status update without reloading
   - On the shopper side, Aide says and shows "Waiting for [caregiver name] to approve", then "Approved, your order is paid" or a kind decline message with the caregiver's note
   - Keep a single function for sending alerts so email or SMS can be added later

5. **Caregiver dashboard** (`frontend/src/routes/care/`):
   - Layout: summary cards at the top (spent this month, limit left, orders waiting), AG Grid orders ledger in the middle, approval queue on the right (stacked below on mobile)
   - Ledger columns: date, item, retailer, price, status, method (voice or button), approved by. Sorting, filtering, quick search, status shown as a word plus a colour, CSV export.
   - Row click opens a side panel with the order details and the conversation transcript
   - Charts (AG Charts): spend by month, spend by category
   - Light and dark themes using AG Grid's theming, matching the app's colours
   - Keyboard and screen-reader checks on the grid (AG Grid has accessibility docs; follow them)

6. **"Ask about spending" box**:
   - The caregiver types a question such as "What did Mum spend on health products this month?"
   - The LLM must not write SQL. It chooses from a fixed set of safe query templates (filter by date range, category, retailer, status; group by month, category or retailer) and fills in their parameters
   - The back end runs the chosen template, then returns the data, a one-sentence answer and a chart type
   - The front end shows the answer and renders the chart with AG Charts
   - Tests with the LLM mocked: three example questions and one question it should refuse ("delete all orders")

7. **Demo data**:
   - Extend the seed script: two months of realistic orders for one shopper across five categories, one order waiting for approval, one declined with a note

8. **Final check**: run all tests and linters, then give me a manual test script: shopper places an over-limit order by voice, caregiver sees the alert, approves it, and the ledger and charts update. List anything that needs the AG Grid trial licence key.
Read the updated CLAUDE.md carefully first: the product has changed. Aide is now an AI personal shopper for everyone. There is no caregiver role and no second approver; the user sets their own spending rules.

Today is Day 5: reshape the existing code to the new product and give it a professional design. Don't build Price Watch yet; that's Day 6.

Before changing anything, give me a short plan: what you will keep, rename, move or delete, and the migrations you will add. Wait for my OK, then work in the steps below. Stop after each step, run the tests and linters, and tell me what changed.

1. **Remove the caregiver model**:
   - Delete the caregiver role, care_links, approvals, the caregiver routes and the `/care` front end
   - Replace `limits` with `spending_rules` (monthly_budget, ask_above, blocked_categories) owned by the user
   - Over-limit orders no longer wait for someone else. Instead, the confirm step returns a warning ("This puts you $40 over your monthly budget") and requires a second, explicit confirmation from the same user.
   - Update order statuses to match CLAUDE.md and add the `order_events` table
   - Delete tests for removed features; update the rest so everything passes

2. **Restructure to the layout in CLAUDE.md**:
   - Back end: routers → services → integrations, `core/` for config, database, errors and logging, `schemas/` for Pydantic models
   - Front end: `features/` folders (shop, orders, settings for now) and an `app/` shell
   - Move code without changing behaviour, and keep the tests green after every move
   - Local database is SQLite (`DATABASE_URL=sqlite:///./aide.db`); make sure all migrations run on SQLite and on Postgres. No Docker.

3. **Design system**:
   - Install shadcn/ui and set it up with Tailwind; add Button, Card, Input, Textarea, Dialog, Sheet, Tabs, Badge, Toast, Skeleton, DropdownMenu, Avatar
   - `styles/tokens.css` with colour, radius, spacing and shadow tokens for light and dark themes, using neutral greys and one deep-indigo accent; map them in the Tailwind config
   - Inter from Google Fonts, tabular numbers for prices
   - A theme toggle (light, dark, system) saved to the user's settings

4. **App shell**:
   - Desktop: left sidebar with Shop, Watches, Orders, Planner, Settings, plus the user's avatar and name
   - Mobile (below 768 px): bottom tab bar with the same five items
   - Watches, Orders and Planner show a polished empty state for now ("Your price watches will appear here")

5. **Redesign the Shop (chat) screen**:
   - A centred conversation column with a clean composer at the bottom: text input, optional mic button, send button
   - Suggested prompts on the empty screen ("Headphones under $200 for flights", "A gift for my sister who loves cooking", "Running shoes like my old Pegasus")
   - Product cards per CLAUDE.md: image, title, retailer, price, one-line reason, "Buy" and "Watch price" (disabled with a "Coming soon" tooltip today)
   - The checkout step as a Sheet: item, retailer, price, delivery, total, any spending-rule warning, then the PayPal buttons
   - A success screen after payment with the order summary
   - Skeletons while Aide is thinking, and friendly error messages

6. **Settings screen**:
   - Profile (name, language, currency), spending rules (monthly budget, ask-above amount, blocked categories), appearance (theme)
   - Clean form layout with labels, help text and validation

7. **Final check**: run all tests and linters, then show me screenshots or describe the Shop screen on desktop and on a 375 px phone in both themes. List anything that still looks unfinished.
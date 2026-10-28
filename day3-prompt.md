Read CLAUDE.md first. Today is Day 3: voice and languages. By the end, a shopper can speak a request in English, Spanish, French or Arabic, hear Aide's replies, and confirm a purchase by voice. Text input must keep working everywhere.

Work in the steps below. Stop after each one, run the tests and linter, and tell me what you did before moving on.

1. **Shopper settings**:
   - `GET /shoppers/{id}/settings` and `PATCH /shoppers/{id}/settings` for language, voice_speed and text_size (already in the users table)
   - A settings screen in `/shop` with large controls: language picker, text size (20–32 px), voice speed (slow, normal), and a "Test voice" button
   - Text size applies app-wide through a CSS variable; settings load on start

2. **Speech helpers** (`frontend/src/lib/speech.ts`):
   - Speech to text with the browser Web Speech API, using the shopper's language code (en-US, es-ES, fr-FR, ar-SA)
   - Text to speech with `speechSynthesis`, choosing a voice for the language and applying voice_speed
   - Feature detection: if speech recognition isn't supported (for example Firefox), hide the mic and show a short message that typing works
   - Handle errors (no mic permission, no speech heard) with plain, spoken and visible messages
   - Unit tests with the browser APIs mocked

3. **Talk to Aide button**:
   - Press to start listening, press again to stop (no hold-to-talk, which is hard for motor impairments). Keyboard: Space or Enter.
   - While listening: a clear "Listening…" label and a live transcript
   - The transcript appears in the message box so the shopper can fix it before sending, plus an "auto-send when I stop speaking" setting (on by default)
   - Respect `prefers-reduced-motion` for any listening animation

4. **Spoken replies**:
   - Aide reads every reply aloud by default (setting to turn off)
   - Each message has Replay and Stop buttons
   - Speaking stops when the shopper starts talking or presses Stop
   - Product cards are read as one short sentence each: number, name, price, one reason

5. **Languages**:
   - The agent replies in the shopper's language setting; if the shopper clearly speaks another language, it replies in that one and offers to switch the setting
   - UI strings translated for en, es, fr, ar in `frontend/src/i18n/` (no hard-coded text in components)
   - Arabic sets `dir="rtl"` on the page and the layout mirrors correctly
   - Prices formatted with `Intl.NumberFormat` for the shopper's language and the order currency

6. **Voice confirmation** (follow the payment rules in CLAUDE.md exactly):
   - Before asking to buy, Aide reads back the item, retailer and full total, then asks "Shall I buy it?" in the shopper's language
   - The "Yes, buy it" button stays visible the whole time
   - A spoken answer counts as yes only if it matches a short, explicit yes list for that language (for example yes / sí / oui / نعم and close variants). Anything else, including "maybe" or "how much again?", is not a yes: Aide answers or repeats the question.
   - The yes is sent to `POST /orders/{id}/confirm` with the exact title, price, currency and total that were read out, and the transcript of the yes
   - Store `confirmation_method` (voice or button) and the transcript on the order (add a migration; tell me before changing the model)
   - Tests: yes in each language, a no, an unclear answer, and a price change after the read-back

7. **Final check**: run all tests and linters, then give me a manual test script for Chrome: one full purchase by voice in Spanish, one in Arabic checking the RTL layout, and one with the mic blocked to confirm typing still works. List anything that doesn't work in Safari or Firefox.
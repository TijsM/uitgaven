# Uitgaven

Live: https://uitgaven-one.vercel.app

Snap a receipt or upload an invoice; it lands in the Notion database "Uitgaven" (under Pieter Kleijnstraat 19).

Flow: take a photo (opens the camera on mobile) or pick a file. While you look at the review screen, the file is uploaded to Notion and Claude (Sonnet 5.5) reads description, vendor, date, total, VAT and category. Check or edit, pick the payment method, save.

Vendor, category and payment method are Notion selects: the app lists the existing options live, and anything new (marked "nieuw") becomes a new option in Notion.

"Nog toe te voegen" is a list of expenses you know about but don't have the invoice of yet. They're rows in the same database with the checkbox "Nog toe te voegen" ticked (the column is created on first use) and are left out of the overview. Tap "📎 Factuur" on an item when the invoice arrives: it is read like any other receipt, and saving fills in that same row and unticks it.

## Setup

1. Create an internal integration at https://www.notion.so/profile/integrations and copy its token.
2. In Notion, open the "Uitgaven" database → `•••` → Connections → add the integration.
3. `cp .env.example .env.local` and fill in the values.
4. `pnpm install && pnpm dev`

Deploys to Vercel automatically on every push to `main`.

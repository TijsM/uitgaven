# Uitgaven

Live: https://uitgaven-one.vercel.app

Snap a receipt or upload an invoice; it lands in the Notion database "Uitgaven" (under Pieter Kleijnstraat 19).

Flow: take a photo (opens the camera on mobile) or pick a file. While you look at the review screen, the file is uploaded to Notion and Claude (Sonnet 5.5) reads description, vendor, date, total, VAT and category. Check or edit, pick the payment method, save.

Vendor, category and payment method are Notion selects: the app lists the existing options live, and anything new (marked "nieuw") becomes a new option in Notion.

## Setup

1. Create an internal integration at https://www.notion.so/profile/integrations and copy its token.
2. In Notion, open the "Uitgaven" database → `•••` → Connections → add the integration.
3. `cp .env.example .env.local` and fill in the values.
4. `pnpm install && pnpm dev`

Deploys to Vercel automatically on every push to `main`.

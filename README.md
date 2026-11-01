# Uitgaven

Snap a receipt or upload an invoice; it lands in the Notion database "Uitgaven" (under Pieter Kleijnstraat 19).

Flow: pick who paid and the payment method (both remembered per device), tap "Bon toevoegen", choose a photo or PDF. The server answers immediately and, in the background, uploads the file to Notion, has Claude read vendor/date/amount/VAT/category, and creates the row. If reading fails, the row is still created with the file attached and a "⚠️ Niet herkend" title.

Payment methods come live from the Notion select options; a new one typed in the app becomes a new option in Notion.

## Setup

1. Create an internal integration at https://www.notion.so/profile/integrations and copy its token.
2. In Notion, open the "Uitgaven" database → `•••` → Connections → add the integration.
3. `cp .env.example .env.local` and fill in the values.
4. `pnpm install && pnpm dev`

Deploy: `vercel` and set the same environment variables in the Vercel project.

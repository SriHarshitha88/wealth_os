# Wealth OS — Portfolio Management CRM

Production wealth-management CRM for investment advisors. Built to run on **free tiers**:

| Layer | Service | Free tier |
|---|---|---|
| App + API + cron | **Vercel** (Next.js) | Hobby |
| Database + Auth + Realtime | **Supabase** (Postgres) | ≤ 500 MB |
| Market data | **Twelve Data** | ~800 calls/day |
| Transactional email | **Resend** | ≤ 3k/mo |

**Design decision that keeps hosting free:** an advisor CRM does not need tick-by-tick prices.
Prices are refreshed by a **scheduled Vercel Cron job** (~1 min during market hours) that polls Twelve Data
and writes to the `securities` table. The UI reads those prices — no always-on WebSocket server to pay for.
Market data comes from **Twelve Data** (free API key, no brokerage account required).

---

## 1. Prerequisites
- Node 18+ and npm
- A free **Supabase** project → https://supabase.com
- A free **Twelve Data** API key → https://twelvedata.com (just email sign-up — no brokerage account)

## 2. Local setup
```bash
npm install
cp .env.example .env.local     # then fill in the values (see below)
npm run dev                     # http://localhost:3000
```

## 3. Create the database
In the Supabase dashboard → **SQL Editor**, paste and run the contents of:
```
supabase/schema.sql
```
This creates every table, the row-level-security policies (each advisor sees only their own clients),
and the portfolio views the dashboard reads from.

### Load the stock list (the New-Transaction picker reads this)
The `securities` table starts empty. Fill it one of two ways:

- **Real (recommended):** `npm run import:securities` — pulls the full NSE equity list from Twelve Data
  (real company names + tickers). Requires `TWELVEDATA_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`.
- **Dummy (only if you want to poke at the UI first):** paste `supabase/seed.sql` into the Supabase SQL editor — 24 stocks with placeholder prices.

## 4. Environment variables (`.env.local`, and later in Vercel → Settings → Environment Variables)
```
NEXT_PUBLIC_SUPABASE_URL=        # Supabase → Project Settings → API
NEXT_PUBLIC_SUPABASE_ANON_KEY=   # Supabase → Project Settings → API (anon public)
SUPABASE_SERVICE_ROLE_KEY=       # Supabase → Project Settings → API (service_role — SERVER ONLY, never expose)

TWELVEDATA_API_KEY=              # free API key from your Twelve Data dashboard

CRON_SECRET=                     # any long random string; Vercel sends it to protect the cron route
```

## 5. Deploy
```bash
# push to GitHub, then "Import Project" on vercel.com
```
- Add all the env vars above in Vercel.
- `vercel.json` already registers the price-polling cron.
- **Note on Vercel Hobby cron:** the free plan limits how often cron runs. If you need true 1-minute
  refresh, either upgrade, or move the schedule into **Supabase** (`pg_cron` → an Edge Function calling
  the same logic in `lib/angelone.ts`). Instructions in `supabase/CRON.md` (todo, next phase).

---

## Project map
```
app/
  login/                 Sign-in (Supabase Auth)
  (app)/                 Authenticated shell (sidebar + topbar)
    dashboard/           KPIs + widgets, reads live portfolio values
    clients/             Client CRM (next phase)
  api/cron/poll-prices/  Scheduled Twelve Data price refresh
  actions/               Server Actions (transactions, auth)
components/               Sidebar, New Transaction modal, UI pieces
lib/
  supabase/              Browser + server Supabase clients
  angelone.ts            SmartAPI auth + quote fetch
supabase/schema.sql      Full data model + RLS
```

## Roadmap (we agreed to split this)
- **Phase 1 (this repo):** auth, schema, dashboard, New Transaction → DB, price polling. 
- **Phase 2:** Clients CRM screen, Portfolio detail, holdings recompute on each transaction.
- **Phase 3:** High-water-mark Fee Engine, Reports (PDF/Excel), AI Copilot, Client Portal.
- **Phase 4:** WhatsApp/SMS (paid — Twilio/WhatsApp Business), corporate actions, mutual funds.

> Figures in the UI are placeholders until you load real clients and the cron starts writing prices.

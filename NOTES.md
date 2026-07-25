# Wealth OS — Project Notes

Quick reference for the state of the project and the non-obvious decisions behind it.
(For setup/deploy steps, see [README.md](README.md).)

## At a glance
- **Stack:** Next.js 15 (App Router) + Supabase (Postgres/Auth/RLS) + Vercel
- **Live:** https://wealth-os-puce.vercel.app
- **Repo:** https://github.com/SriHarshitha88/wealth_os (auto-deploys on push to `main`)
- **Running cost:** ₹0 on free tiers
- Built and deployed: July 2026

## Modules (all working on real data)
- **Dashboard** — KPIs (AUM / invested / P&L / fees) + allocation donut + top holdings + recent transactions
- **Clients** — CRM list, select & delete, per-client PDF report
- **Portfolios** — every holding across clients: invested price / current price / P&L
- **Reports** — branded PDF portfolio statement (`@react-pdf`, AMC-statement style)
- **Fee Engine** — high-water-mark performance fees (charge on +20%, reset the basis)
- **AI Copilot** — natural-language Q&A over your own data via tool-calling

## Data providers (and why)
- **Stock prices → Yahoo Finance** (`query1.finance.yahoo.com`, `.NS` suffix; free, no key).
  Twelve Data's free tier returns the NSE *symbol list* but **not** Indian *prices*.
- **Stock names/list → Twelve Data** (`/stocks`, free) — loaded via `npm run import:securities`.
- **AI Copilot → Google Gemini**, model **`gemini-flash-latest`**.
  A 2.5 "thinking" model — the copilot route echoes the model's response verbatim to preserve
  the required `thought_signature`. (`gemini-2.0-flash` has 0 free quota on this project.)
- **Mutual fund NAVs (future) →** AMFI / MFAPI (free, not yet wired).

## Operational notes
- **Secrets** live in `.env.local` (gitignored). The same keys are set as Vercel env vars.
- **Dates** are pinned to **IST (Asia/Kolkata)** in server components (Vercel runs UTC).
- **Manual SQL applied once:** `alter table fee_marks add column fee_rate numeric(5,2) not null default 15;`
- **Price refresh:** the Vercel Hobby free tier allows only a **daily** cron (`0 10 * * 1-5`).
  Prices also refresh on every recorded trade, and on-demand via `npm run refresh:prices`.
  For minute-level auto-refresh: Vercel Pro, or move the cron to Supabase `pg_cron`.
- **Supabase Auth:** the live Vercel URL must be added under Authentication → URL Configuration.

## Helper scripts
```
npm run import:securities   # load NSE stock list into Supabase
npm run refresh:prices      # pull latest prices for held stocks (Yahoo)
npm run create:advisor      # create/reset an advisor login (set ADVISOR_EMAIL/PASSWORD)
```

## Open / optional next
- Mobile card-list views + bottom nav (tables currently scroll sideways on phones)
- Sector data (needs a fundamentals API — Finnhub / FMP free tier)
- Realised gains on Sell transactions (separate from unrealised on holdings)
- Move price cron to Supabase for frequent auto-refresh

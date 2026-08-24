-- =====================================================================
--  Prevent double-billing a performance-fee milestone (concurrency guard).
--  Adds a typed `band` column (the 20% milestone level 1..5) and a unique
--  index per client, so two simultaneous "Bill" clicks can't both insert the
--  same band. Run once in the Supabase SQL Editor.
--
--  AFTER running this, the app code is wired to set `fees.band` on each
--  milestone fee and to treat a unique-violation as "already billed".
-- =====================================================================

alter table fees add column if not exists band smallint;   -- 1..5 for PF-L rows; null for above-100% / other fees

-- Backfill from the existing invoice_no tag (PF-L{level}-…).
update fees
set band = substring(invoice_no from '^PF-L(\d)')::smallint
where invoice_no ~ '^PF-L\d' and band is null;

-- One collected fee per (client, band). Partial: only constrains milestone rows.
create unique index if not exists fees_client_band_uniq
  on fees (client_id, band)
  where band is not null and status = 'Collected';

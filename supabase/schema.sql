-- =====================================================================
--  Wealth OS — Portfolio Management CRM
--  Full schema + Row Level Security. Run this once in Supabase SQL Editor.
--  Model: each advisor (an auth user) owns their clients; every client
--  row cascades ownership to holdings, transactions, fees, etc. via RLS.
-- =====================================================================

-- ---------- enums ----------
create type client_tier      as enum ('Platinum','Gold','Silver');
create type risk_profile     as enum ('Conservative','Balanced','Growth');
create type lifecycle_stage  as enum ('Prospect','Onboarding','Accumulation','Distribution','Estate','Dormant');
create type txn_side         as enum ('Buy','Sell','Dividend','Bonus','Split','IPO','Deposit','Withdrawal');
create type fee_status       as enum ('Upcoming','Pending','Collected','Overdue');

-- ---------- profiles (one per advisor / staff user) ----------
create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  firm_name   text,
  role        text not null default 'advisor',   -- advisor | staff | admin
  created_at  timestamptz not null default now()
);

-- Auto-create a profile row when a new auth user signs up
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name) values (new.id, new.raw_user_meta_data->>'full_name');
  return new;
end; $$;
create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- ---------- securities (shared master; prices updated by the cron job) ----------
create table securities (
  id             bigint generated always as identity primary key,
  symbol         text not null,
  name           text not null,
  exchange       text not null default 'NSE',       -- NSE | BSE
  angel_token    text,                               -- SmartAPI instrument token
  sector         text,
  last_price     numeric(14,2),
  prev_close     numeric(14,2),
  last_price_at  timestamptz,
  unique (exchange, symbol)
);
create index on securities using gin (to_tsvector('simple', name || ' ' || symbol));

-- ---------- clients (the household / relationship) ----------
create table clients (
  id               uuid primary key default gen_random_uuid(),
  advisor_id       uuid not null references auth.users(id) on delete cascade,
  name             text not null,
  email            text,
  phone            text not null,
  tier             client_tier     not null default 'Silver',
  risk_profile     risk_profile    not null default 'Balanced',
  lifecycle_stage  lifecycle_stage not null default 'Onboarding',
  relationship_mgr text,
  retention_risk   int not null default 10,          -- 0-100, set by analytics job
  wallet_share     int,                              -- 0-100, % of assets we manage
  started_at       date not null default current_date,
  created_at       timestamptz not null default now()
);
create index on clients (advisor_id);

-- ---------- transactions (source of truth; holdings are derived) ----------
create table transactions (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references clients(id) on delete cascade,
  security_id   bigint references securities(id),
  side          txn_side not null,
  quantity      numeric(18,4) not null default 0,
  price         numeric(14,2) not null default 0,
  traded_at     timestamptz not null default now(),
  note          text,
  created_by    uuid references auth.users(id) default auth.uid()
);
create index on transactions (client_id);

-- ---------- holdings (current position per client+security) ----------
create table holdings (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references clients(id) on delete cascade,
  security_id  bigint not null references securities(id),
  quantity     numeric(18,4) not null default 0,
  avg_price    numeric(14,2) not null default 0,
  unique (client_id, security_id)
);
create index on holdings (client_id);

-- ---------- advisory fees ----------
create table fees (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references clients(id) on delete cascade,
  amount      numeric(14,2) not null,
  due_date    date,
  status      fee_status not null default 'Upcoming',
  invoice_no  text,
  paid_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index on fees (client_id);

-- ---------- high-water marks (performance-fee engine) ----------
create table fee_marks (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references clients(id) on delete cascade unique,
  last_basis    numeric(16,2) not null,   -- e.g. 12000000 (the current high-water mark)
  step_pct      numeric(5,2)  not null default 20,   -- trigger threshold: fee due when value grows this %
  fee_rate      numeric(5,2)  not null default 15,   -- performance fee charged on gain above the mark
  next_trigger  numeric(16,2) generated always as (last_basis * (1 + step_pct/100)) stored,
  updated_at    timestamptz not null default now()
);

-- =====================================================================
--  Views the app reads
-- =====================================================================

-- per-client valuation. security_invoker=on makes the view honour the
-- querying user's RLS (Postgres views otherwise run as their owner and bypass it).
create view client_valuation with (security_invoker = on) as
select
  c.id as client_id, c.advisor_id, c.name, c.tier,
  coalesce(sum(h.quantity * s.last_price), 0)  as current_value,
  coalesce(sum(h.quantity * h.avg_price), 0)   as invested_value,
  coalesce(sum(h.quantity * s.last_price), 0)
    - coalesce(sum(h.quantity * h.avg_price), 0) as unrealized_pl
from clients c
left join holdings h  on h.client_id = c.id
left join securities s on s.id = h.security_id
group by c.id;

-- =====================================================================
--  Row Level Security — advisors see ONLY their own book
-- =====================================================================
alter table profiles     enable row level security;
alter table clients      enable row level security;
alter table transactions enable row level security;
alter table holdings     enable row level security;
alter table fees         enable row level security;
alter table fee_marks    enable row level security;
alter table securities   enable row level security;

-- profiles: you can read/update your own
create policy "own profile"        on profiles     for all  using (id = auth.uid()) with check (id = auth.uid());

-- securities: any signed-in user may read; only the service role (cron) writes
create policy "read securities"    on securities   for select using (auth.role() = 'authenticated');

-- clients: owned by advisor
create policy "own clients"        on clients      for all
  using (advisor_id = auth.uid()) with check (advisor_id = auth.uid());

-- child tables: owned transitively through clients
create policy "own transactions"   on transactions for all
  using  (exists (select 1 from clients c where c.id = transactions.client_id and c.advisor_id = auth.uid()))
  with check (exists (select 1 from clients c where c.id = transactions.client_id and c.advisor_id = auth.uid()));

create policy "own holdings"       on holdings     for all
  using  (exists (select 1 from clients c where c.id = holdings.client_id and c.advisor_id = auth.uid()))
  with check (exists (select 1 from clients c where c.id = holdings.client_id and c.advisor_id = auth.uid()));

create policy "own fees"           on fees         for all
  using  (exists (select 1 from clients c where c.id = fees.client_id and c.advisor_id = auth.uid()))
  with check (exists (select 1 from clients c where c.id = fees.client_id and c.advisor_id = auth.uid()));

create policy "own fee_marks"      on fee_marks    for all
  using  (exists (select 1 from clients c where c.id = fee_marks.client_id and c.advisor_id = auth.uid()))
  with check (exists (select 1 from clients c where c.id = fee_marks.client_id and c.advisor_id = auth.uid()));

-- =====================================================================
--  Firm-shared visibility
--  Advisors in the same firm see (and manage) the same book of clients.
--  Run once in the Supabase SQL Editor.
-- =====================================================================

-- 1) Group advisors into a firm. (Upsert so a profile row is guaranteed to
--    exist even if the signup trigger never created one.)
alter table profiles add column if not exists firm_id uuid;

insert into profiles (id, firm_id) values
  ('8105f202-a43e-4106-a36c-62951353f733', '0000a5eb-0000-4000-8000-000000000001'), -- asequityadvisory@gmail.com
  ('6eb25e13-8584-4269-8c3d-8bf56be765da', '0000a5eb-0000-4000-8000-000000000001'), -- jampani91@gmail.com
  ('6fa81724-f91e-4eb7-b407-de89bf601ccb', '0000a5eb-0000-4000-8000-000000000001')  -- harshithajampani81@gmail.com
on conflict (id) do update set firm_id = excluded.firm_id;

-- 2) Helper: is `owner` in the same firm as the calling user?
--    SECURITY DEFINER so it can read profiles past their own RLS without recursion.
create or replace function public.same_firm(owner uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from profiles me
    join profiles o on o.firm_id = me.firm_id
    where me.id = auth.uid()
      and o.id = owner
      and me.firm_id is not null
  );
$$;

-- 3) Replace the owner-scoped policies with firm-scoped ones.
drop policy if exists "own clients" on clients;
create policy "firm clients" on clients for all
  using (same_firm(advisor_id))
  with check (same_firm(advisor_id));

drop policy if exists "own transactions" on transactions;
create policy "firm transactions" on transactions for all
  using  (exists (select 1 from clients c where c.id = transactions.client_id and same_firm(c.advisor_id)))
  with check (exists (select 1 from clients c where c.id = transactions.client_id and same_firm(c.advisor_id)));

drop policy if exists "own holdings" on holdings;
create policy "firm holdings" on holdings for all
  using  (exists (select 1 from clients c where c.id = holdings.client_id and same_firm(c.advisor_id)))
  with check (exists (select 1 from clients c where c.id = holdings.client_id and same_firm(c.advisor_id)));

drop policy if exists "own fees" on fees;
create policy "firm fees" on fees for all
  using  (exists (select 1 from clients c where c.id = fees.client_id and same_firm(c.advisor_id)))
  with check (exists (select 1 from clients c where c.id = fees.client_id and same_firm(c.advisor_id)));

drop policy if exists "own fee_marks" on fee_marks;
create policy "firm fee_marks" on fee_marks for all
  using  (exists (select 1 from clients c where c.id = fee_marks.client_id and same_firm(c.advisor_id)))
  with check (exists (select 1 from clients c where c.id = fee_marks.client_id and same_firm(c.advisor_id)));

-- To split advisors into separate firms later, give them different firm_id values.

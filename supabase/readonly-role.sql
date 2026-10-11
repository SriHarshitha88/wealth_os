-- ============================================================================
-- claude_readonly — a strictly read-only database role
-- ============================================================================
-- Run once in the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- Replace the password on the next line first.
--
-- Why policies rather than BYPASSRLS: every table here has RLS enabled and
-- every policy keys off auth.uid() / same_firm(advisor_id). A new role matches
-- none of them, so without explicit policies it would read zero rows. Granting
-- BYPASSRLS would also work but needs superuser, is invisible in the dashboard,
-- and is all-or-nothing. Per-table SELECT policies are explicit, auditable, and
-- can be dropped one at a time.
-- ============================================================================

-- 1. the role. Change this password, and keep it out of git.
create role claude_readonly with login password 'CHANGE_ME_TO_A_LONG_RANDOM_STRING';

-- 2. let it reach the database and the schema, and read today's tables
grant connect on database postgres to claude_readonly;
grant usage   on schema public     to claude_readonly;
grant select  on all tables    in schema public to claude_readonly;
grant select  on all sequences in schema public to claude_readonly;

-- 3. ...and any table added later
alter default privileges in schema public grant select on tables    to claude_readonly;
alter default privileges in schema public grant select on sequences to claude_readonly;

-- 4. explicitly NOT write. These are the defaults, but state them so an
--    accidental future "grant all ... to public" cannot quietly widen this.
revoke insert, update, delete, truncate on all tables in schema public from claude_readonly;
alter default privileges in schema public revoke insert, update, delete, truncate on tables from claude_readonly;

-- 5. RLS: one read-only policy per table. `using (true)` means "all rows",
--    but only for SELECT and only for this role.
create policy "claude_readonly reads" on public.profiles     for select to claude_readonly using (true);
create policy "claude_readonly reads" on public.clients      for select to claude_readonly using (true);
create policy "claude_readonly reads" on public.transactions for select to claude_readonly using (true);
create policy "claude_readonly reads" on public.holdings     for select to claude_readonly using (true);
create policy "claude_readonly reads" on public.fees         for select to claude_readonly using (true);
create policy "claude_readonly reads" on public.fee_marks    for select to claude_readonly using (true);
create policy "claude_readonly reads" on public.securities   for select to claude_readonly using (true);

-- 6. sanity check — expect rolcanlogin t, and every write column f
select rolname, rolcanlogin, rolsuper, rolcreaterole, rolcreatedb, rolbypassrls
from pg_roles where rolname = 'claude_readonly';

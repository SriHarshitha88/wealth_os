-- Undo readonly-role.sql completely. Run in the Supabase SQL editor.
drop policy if exists "claude_readonly reads" on public.profiles;
drop policy if exists "claude_readonly reads" on public.clients;
drop policy if exists "claude_readonly reads" on public.transactions;
drop policy if exists "claude_readonly reads" on public.holdings;
drop policy if exists "claude_readonly reads" on public.fees;
drop policy if exists "claude_readonly reads" on public.fee_marks;
drop policy if exists "claude_readonly reads" on public.securities;

alter default privileges in schema public revoke select on tables    from claude_readonly;
alter default privileges in schema public revoke select on sequences from claude_readonly;
revoke all on all tables    in schema public from claude_readonly;
revoke all on all sequences in schema public from claude_readonly;
revoke all on schema public from claude_readonly;
revoke connect on database postgres from claude_readonly;
drop role if exists claude_readonly;

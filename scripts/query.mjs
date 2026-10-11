#!/usr/bin/env node
// Read-only SQL console for the Wealth OS database.
//
//   node --env-file=.env.local scripts/query.mjs "select side, count(*) from transactions group by side"
//
// Connects as claude_readonly (see supabase/readonly-role.sql), which holds only
// SELECT grants and SELECT-only RLS policies, so the database itself refuses
// writes. The guard below is a second line of defence, not the only one: it
// rejects anything that does not read like a single SELECT/WITH statement.

import pg from 'pg';

const url = process.env.SUPABASE_READONLY_URL;
if (!url) {
  console.error('SUPABASE_READONLY_URL is not set in .env.local.');
  console.error('Run supabase/readonly-role.sql first, then add the connection string.');
  process.exit(1);
}

const sql = process.argv.slice(2).join(' ').trim();
if (!sql) {
  console.error('Usage: node --env-file=.env.local scripts/query.mjs "<select ...>"');
  process.exit(1);
}

const stripped = sql.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '').trim();
if (!/^(select|with)\b/i.test(stripped)) {
  console.error('Refused: only SELECT / WITH queries are allowed.');
  process.exit(1);
}
if (/;\s*\S/.test(stripped.replace(/;\s*$/, ''))) {
  console.error('Refused: one statement at a time.');
  process.exit(1);
}
if (/\b(insert|update|delete|truncate|drop|alter|create|grant|revoke|copy)\b/i.test(stripped)) {
  console.error('Refused: the query contains a write keyword.');
  process.exit(1);
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
try {
  await client.connect();
  // Belt and braces: the session itself cannot write, whatever the query says.
  await client.query('set session characteristics as transaction read only');
  const res = await client.query(stripped);
  if (res.rows.length === 0) console.log('(no rows)');
  else console.table(res.rows);
  console.log(`${res.rowCount} row(s)`);
} catch (err) {
  console.error('Query failed:', err.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}

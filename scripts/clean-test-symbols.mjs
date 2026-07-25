// One-off: remove exchange "TEST" instruments that Twelve Data includes in its NSE list.
import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
if (!globalThis.WebSocket) globalThis.WebSocket = ws;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const { error, count } = await supabase
  .from('securities')
  .delete({ count: 'exact' })
  .ilike('symbol', '%TEST%');

console.log(error ? `Error: ${error.message}` : `Removed ${count} test symbols.`);

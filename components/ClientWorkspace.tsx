'use client';

import { useState } from 'react';
import ClientHoldings, { type HoldingRow } from './ClientHoldings';
import ClientTransactions, { type Trade } from './ClientTransactions';
import CapitalGains, { type GainSlice } from './CapitalGains';
import type { CGBucket } from '@/lib/capital-gains';

export default function ClientWorkspace({
  clientId, holdings, ledger, gains,
}: {
  clientId: string;
  holdings: HoldingRow[];
  ledger: Trade[];
  gains: { slices: GainSlice[]; fyList: string[]; unreal: { short: CGBucket; long: CGBucket; daysToLTCG: number | null } };
}) {
  const [tab, setTab] = useState<'holdings' | 'gains' | 'txns'>('holdings');
  const soldCount = new Set(gains.slices.map((s) => s.symbol)).size;

  return (
    <>
      <div className="tabs">
        <button className={tab === 'holdings' ? 'on' : ''} onClick={() => setTab('holdings')}>Holdings</button>
        <button className={tab === 'gains' ? 'on' : ''} onClick={() => setTab('gains')}>Capital gains{gains.slices.length ? ` (${soldCount})` : ''}</button>
        <button className={tab === 'txns' ? 'on' : ''} onClick={() => setTab('txns')}>Transactions</button>
      </div>

      {tab === 'holdings' && <ClientHoldings clientId={clientId} rows={holdings} />}
      {tab === 'gains' && <CapitalGains clientId={clientId} slices={gains.slices} fyList={gains.fyList} unreal={gains.unreal} />}
      {tab === 'txns' && <ClientTransactions clientId={clientId} rows={ledger} />}
    </>
  );
}

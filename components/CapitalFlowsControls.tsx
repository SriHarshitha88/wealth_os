'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { fyStartOf, todayIST } from '@/lib/capital-flows';

type ClientOpt = { id: string; name: string };

function lastFY(today: string): { from: string; to: string } {
  const start = fyStartOf(today);
  const y = Number(start.slice(0, 4));
  return { from: `${y - 1}-04-01`, to: `${y}-03-31` };
}

const PRESETS = ['This FY', 'Last FY', 'Last 12 months', 'All time', 'Custom'] as const;
type Preset = (typeof PRESETS)[number];

function rangeOf(p: Preset, today: string): { from: string; to: string } | null {
  if (p === 'This FY') return { from: fyStartOf(today), to: today };
  if (p === 'Last FY') return lastFY(today);
  if (p === 'Last 12 months') {
    const d = new Date(today + 'T00:00:00Z');
    d.setUTCFullYear(d.getUTCFullYear() - 1);
    return { from: d.toISOString().slice(0, 10), to: today };
  }
  if (p === 'All time') return { from: '2000-01-01', to: today };
  return null; // Custom — dates picked manually
}

export default function CapitalFlowsControls({ clients, clientId, from, to }: {
  clients: ClientOpt[]; clientId: string | null; from: string; to: string;
}) {
  const router = useRouter();
  const today = todayIST();

  // which preset matches the current range?
  const detected = PRESETS.find((p) => {
    const r = rangeOf(p, today);
    return r && r.from === from && r.to === to;
  }) ?? 'Custom';
  const [preset, setPreset] = useState<Preset>(detected);

  const go = (cid: string | null, f: string, t: string) => {
    if (!cid) return;
    router.push(`/capital-flows?client=${cid}&from=${f}&to=${t}`);
  };

  const onPreset = (p: Preset) => {
    setPreset(p);
    const r = rangeOf(p, today);
    if (r) go(clientId, r.from, r.to);
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <label style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>Client</label>
      <select value={clientId ?? ''} onChange={(e) => go(e.target.value, from, to)} style={{ padding: '7px 9px', fontSize: 13, minWidth: 180 }}>
        {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>

      <label style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>Period</label>
      <select value={preset} onChange={(e) => onPreset(e.target.value as Preset)} style={{ padding: '7px 9px', fontSize: 13 }}>
        {PRESETS.map((p) => <option key={p} value={p}>{p}</option>)}
      </select>

      {preset === 'Custom' && (
        <>
          <input type="date" value={from} max={to} onChange={(e) => go(clientId, e.target.value, to)} style={{ padding: '6px 8px', fontSize: 12.5 }} />
          <span style={{ color: 'var(--ink-3)', fontSize: 12.5 }}>to</span>
          <input type="date" value={to} min={from} max={today} onChange={(e) => go(clientId, from, e.target.value)} style={{ padding: '6px 8px', fontSize: 12.5 }} />
        </>
      )}
    </div>
  );
}

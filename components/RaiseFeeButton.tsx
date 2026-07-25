'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { raiseFee } from '@/app/actions/fees';

export default function RaiseFeeButton({ clientId, label }: { clientId: string; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onClick() {
    if (!confirm('Raise this performance fee and reset the high-water mark to the current value?')) return;
    setBusy(true);
    const res = await raiseFee(clientId);
    setBusy(false);
    if (res.ok) router.refresh();
    else alert(res.error ?? 'Could not raise the fee.');
  }

  return (
    <button className="btn primary" onClick={onClick} disabled={busy}>
      {busy ? 'Raising…' : label}
    </button>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';

// Split download button: one control, a menu offering the same report as
// PDF or as an Excel workbook (the API routes accept ?format=pdf|xlsx).
export default function DownloadMenu({
  base, label = 'Download', primary = false,
}: { base: string; label?: string; primary?: boolean }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const sep = base.includes('?') ? '&' : '?';

  return (
    <div className="dl-wrap" ref={wrap}>
      <button type="button" className={'btn' + (primary ? ' primary' : '')} onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}>
        <svg viewBox="0 0 24 24" fill="none" width="15" height="15">
          <path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {label}
        <span className="dl-caret">▾</span>
      </button>
      {open && (
        <div className="sort-menu dl-menu" role="menu">
          <a className="sort-opt" role="menuitem" href={`${base}${sep}format=pdf`} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}>
            <span className="dl-ext pdf">PDF</span> Document (.pdf)
          </a>
          <a className="sort-opt" role="menuitem" href={`${base}${sep}format=xlsx`} onClick={() => setOpen(false)}>
            <span className="dl-ext xls">XLS</span> Excel workbook (.xlsx)
          </a>
        </div>
      )}
    </div>
  );
}

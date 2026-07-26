'use client';

type Tick = { symbol: string; price: number; changePct: number | null };

// Auto-scrolling stock ticker tape. The list is duplicated so the CSS
// animation (translateX -50%) loops seamlessly; hover pauses it.
export default function PriceTicker({ items }: { items: Tick[] }) {
  if (!items.length) return null;
  const loop = [...items, ...items];
  const duration = Math.max(25, items.length * 2.2); // slower when there are more stocks

  return (
    <div className="ticker" aria-label="Live prices">
      <div className="ticker-track" style={{ animationDuration: `${duration}s` }}>
        {loop.map((t, i) => {
          const up = (t.changePct ?? 0) >= 0;
          return (
            <span className="tick" key={i} aria-hidden={i >= items.length}>
              <span className="tick-sym">{t.symbol}</span>
              <span className="tick-px">₹{t.price.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
              {t.changePct != null && (
                <span className={'tick-chg ' + (up ? 'up' : 'down')}>
                  {up ? '▲' : '▼'} {Math.abs(t.changePct).toFixed(2)}%
                </span>
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}

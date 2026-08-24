'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

type Msg = { role: 'user' | 'model'; text: string };

// Lightweight markdown: **bold**, `code`, and * / - bullet lists.
function renderInline(text: string) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) return <strong key={i}>{p.slice(2, -2)}</strong>;
    if (p.startsWith('`') && p.endsWith('`')) return <code key={i} className="chat-code">{p.slice(1, -1)}</code>;
    return <span key={i}>{p}</span>;
  });
}

function Rich({ text }: { text: string }) {
  const out: ReactNode[] = [];
  let bullets: ReactNode[] = [];
  const flush = (k: string) => { if (bullets.length) { out.push(<ul key={'ul' + k} className="chat-ul">{bullets}</ul>); bullets = []; } };
  text.split('\n').forEach((line, i) => {
    const t = line.trim();
    const m = t.match(/^[*-]\s+(.*)/);
    if (m) bullets.push(<li key={i}>{renderInline(m[1])}</li>);
    else { flush(String(i)); if (t) out.push(<p key={i} className="chat-p">{renderInline(t)}</p>); }
  });
  flush('end');
  return <>{out}</>;
}

const SUGGESTIONS = [
  'Give me a summary of my whole book',
  'Which clients hold Aditya Birla Capital?',
  'Who are my best and worst performing clients?',
  'Which clients have a performance fee due?',
  "What's the current NIFTY level?",
];

export default function Copilot() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bodyRef.current?.scrollTo(0, bodyRef.current.scrollHeight); }, [messages, busy]);

  async function send(text?: string) {
    const q = (text ?? input).trim();
    if (!q || busy) return;
    const next: Msg[] = [...messages, { role: 'user', text: q }];
    setMessages(next);
    setInput('');
    setBusy(true);
    try {
      const res = await fetch('/api/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next }),
      });
      const j = await res.json();
      setMessages((m) => [...m, { role: 'model', text: j.reply ?? j.error ?? 'No response.' }]);
    } catch {
      setMessages((m) => [...m, { role: 'model', text: 'Something went wrong reaching the assistant.' }]);
    }
    setBusy(false);
  }

  return (
    <div className="copilot">
      <div className="chat">
        <div className="chat-body" ref={bodyRef}>
          {messages.length === 0 && (
            <div className="chat-empty">
              <div className="chat-empty-icon">
                <svg viewBox="0 0 24 24" fill="none" width="24" height="24">
                  <path d="M12 3l1.8 4.9L18.7 9.7 13.8 11.5 12 16.4 10.2 11.5 5.3 9.7l4.9-1.8L12 3z" fill="currentColor" />
                  <circle cx="18" cy="17.5" r="1.4" fill="currentColor" opacity=".6" />
                </svg>
              </div>
              <div style={{ fontFamily: 'var(--serif)', fontSize: 19, color: 'var(--ink-2)' }}>What would you like to know?</div>
              <p style={{ maxWidth: '40ch', margin: 0, fontSize: 13.5, lineHeight: 1.5, color: 'var(--ink-3)' }}>
                Ask about any client, portfolio, fee, or live price — every number comes straight from your own book. Pick a starter on the right, or type below.
              </p>
            </div>
          )}
          {messages.map((m, i) =>
            m.role === 'user'
              ? <div key={i} className="msg user">{m.text}</div>
              : <div key={i} className="msg bot"><div className="bubble"><Rich text={m.text} /></div></div>,
          )}
          {busy && <div className="msg bot"><div className="bubble typing">Thinking…</div></div>}
        </div>
        <div className="chat-foot">
          <input
            className="chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
            placeholder="Ask about clients, portfolios, fees…"
          />
          <button className="chat-send" onClick={() => send()} disabled={busy} aria-label="Send">
            <svg viewBox="0 0 24 24" fill="none" width="18" height="18"><path d="M4 12l16-8-6 16-3-7-7-1z" stroke="#fff" strokeWidth="1.7" strokeLinejoin="round" /></svg>
          </button>
        </div>
      </div>

      <div className="suggests">
        <div className="eyebrow" style={{ margin: '2px 2px 6px' }}>Try asking</div>
        {SUGGESTIONS.map((s) => (
          <button key={s} className="suggest" onClick={() => send(s)} disabled={busy}>{s}</button>
        ))}
      </div>
    </div>
  );
}

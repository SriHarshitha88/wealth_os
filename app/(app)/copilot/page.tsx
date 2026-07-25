import Copilot from '@/components/Copilot';

export const dynamic = 'force-dynamic';

export default function CopilotPage() {
  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">AI Copilot</div>
          <h1>Ask your Copilot</h1>
          <p>Natural-language answers across your clients, portfolios, fees and live prices — grounded in your own data.</p>
        </div>
      </div>
      <Copilot />
    </>
  );
}

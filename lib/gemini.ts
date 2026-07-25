// Google Gemini (Generative Language API) — free-tier model.
// gemini-flash-latest is a 2.5 "thinking" model: when echoing a functionCall
// back to the model you must push its content object verbatim (it carries a
// thoughtSignature the API requires) — see the copilot route.
const MODEL = 'gemini-flash-latest';

export async function geminiGenerate(body: unknown) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
  );
  return res.json();
}

/**
 * prompts.js — Prompt Construction
 *
 * Builds the exact prompts sent to Gemini.
 * Centralised here so prompt engineering changes don't scatter across files.
 *
 * Token budget discipline:
 *   - System prompt  ≈  300 tokens  (fixed)
 *   - User prompt    ≤  6,700 tokens (variable — we cap article text)
 *   - Total input    ≤  7,000 tokens
 *   - Max output     =  1,200 tokens
 *   - Total per call ≤  8,200 tokens  (well within 250k TPM)
 *
 * At 15 RPM × 8,200 tokens = 123,000 TPM peak — leaves 50% headroom.
 */

// ─── Token estimation ─────────────────────────────────────────────────────────

/** Rough token count: ~4 chars per token for English text */
export const estimateTokens = (text) => Math.ceil(text.length / 4);

// ─── Article stripping ────────────────────────────────────────────────────────

/**
 * Strip an article down to the minimal signal needed by the AI.
 * Removes HTML, excess whitespace, and truncates long content.
 *
 * @param {{ title: string, content: string, source: string, publishedAt: string }} article
 * @param {number} [maxContentChars=400]
 * @returns {string}
 */
function stripArticle(article, maxContentChars = 400) {
  const content = article.content
    .replace(/<[^>]+>/g, " ")          // strip HTML tags
    .replace(/\s{2,}/g, " ")           // collapse whitespace
    .replace(/\[?\+\d+ chars\]?/g, "") // strip NewsAPI truncation markers
    .trim()
    .slice(0, maxContentChars);

  return `[${article.source}] ${article.title}\n${content}`;
}

// ─── Prompt: Event Brief + Scenarios ─────────────────────────────────────────

export const BRIEF_SYSTEM_PROMPT = `\
You are Grigori, a senior geopolitical intelligence analyst.
You receive a batch of news articles about a single conflict/crisis cluster.
Produce a complete intelligence brief as a single JSON object.

REQUIRED OUTPUT (valid JSON only — no markdown, no extra keys):
{
  "title": string,
  "summary": string,
  "developments": string[],
  "tone": "Escalating" | "Stable" | "De-escalating",
  "confidence": "Low" | "Medium" | "High",
  "scenarios": [
    {
      "name": string,
      "probability": number,
      "description": string,
      "impact": {
        "oil": "Up" | "Neutral" | "Down",
        "markets": "Risk-on" | "Risk-off",
        "sectors": string[]
      }
    }
  ]
}

FIELD RULES:
- title:          ≤12 words. Active voice. Like a classified cable header.
- summary:        2–3 sentences. Analyst register. Cover: what, status, significance.
- developments:   3–5 items. One concrete fact each, ≤20 words.
- tone:           Escalating=worsening, Stable=holding, De-escalating=cooling.
- confidence:     High=3+ corroborating sources, Medium=2, Low=1 or unverified.
- scenarios:      2–3 items. Probabilities MUST sum to exactly 100.
- impact.oil:     Up=supply disruption, Down=demand destruction, Neutral=no effect.
- impact.markets: Risk-off=flight to safety, Risk-on=positive/absorbed signal.
- impact.sectors: choose from [Energy, Defense, Tech, Shipping, Food, Finance].`;

/**
 * Build the user prompt for a cluster brief.
 * Enforces the token budget by truncating article text.
 *
 * @param {object} preEvent
 * @param {object[]} articles       — full Article objects from the store
 * @returns {{ prompt: string, estimatedTokens: number }}
 */
export function buildBriefPrompt(preEvent, articles) {
  const ARTICLE_BUDGET_CHARS = 5_500; // ~1375 tokens for all articles combined
  const perArticleChars = Math.floor(ARTICLE_BUDGET_CHARS / Math.max(articles.length, 1));

  const stripped = articles
    .map((a) => stripArticle(a, Math.max(perArticleChars, 150)))
    .join("\n\n---\n\n");

  const prompt = `\
CLUSTER METADATA
Region   : ${preEvent.region?.label ?? "Unknown"}
Keywords : ${preEvent.keywords.slice(0, 10).join(", ")}
Sources  : ${preEvent.sources.join(", ")}
Articles : ${articles.length}

ARTICLES
${stripped}`;

  return {
    prompt,
    estimatedTokens: estimateTokens(BRIEF_SYSTEM_PROMPT) + estimateTokens(prompt) + 1_200,
  };
}

// ─── Prompt: "Brief Me" (on-demand deep dive) ─────────────────────────────────

export const BRIEF_ME_SYSTEM_PROMPT = `\
You are Grigori, a senior geopolitical intelligence analyst writing an on-demand
executive brief for a decision-maker who needs depth, not brevity.

Respond ONLY with valid JSON:
{
  "executiveSummary": string,
  "keyActors": [{ "name": string, "role": string, "posture": string }],
  "timeline": [{ "date": string, "event": string }],
  "strategicImplications": string[],
  "watchItems": string[]
}

RULES:
- executiveSummary: 4–6 sentences. Comprehensive assessment.
- keyActors: up to 5 actors. posture = Aggressive|Defensive|Neutral|Negotiating.
- timeline: up to 6 recent events, chronological.
- strategicImplications: 3–5 medium-term geopolitical consequences.
- watchItems: 3 specific indicators to monitor in the next 48–72 hours.`;

/**
 * Build the "Brief Me" prompt for a single stored event.
 *
 * @param {import("../store.js").GrigoriEvent} event
 * @returns {{ prompt: string, estimatedTokens: number }}
 */
export function buildBriefMePrompt(event) {
  const prompt = `\
EVENT: ${event.title}
REGION: ${event.location.label}
TONE: ${event.tone}
CONFIDENCE: ${event.confidence}

SUMMARY:
${event.summary}

KEY DEVELOPMENTS:
${event.developments.map((d) => `- ${d}`).join("\n")}

EXISTING SCENARIOS:
${event.scenarios.map((s) => `${s.name} (${s.probability}%): ${s.description}`).join("\n")}`;

  return {
    prompt,
    estimatedTokens: estimateTokens(BRIEF_ME_SYSTEM_PROMPT) + estimateTokens(prompt) + 1_500,
  };
}

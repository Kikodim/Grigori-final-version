/**
 * gemini.provider.js — Google Gemini 2.5 Flash
 *
 * Implements the AIProvider interface for Gemini 2.5 Flash via the
 * Google Generative AI REST API (no SDK dependency — plain fetch).
 *
 * Rate limits (free tier, as of 2026):
 *   15 RPM  |  250 RPD  |  250,000 TPM
 *
 * These are declared here and consumed by the rate limiter.
 * If you upgrade to a paid tier, only change LIMITS below.
 */

import { log } from "../../utils/logger.js";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const MODEL    = "gemini-2.5-flash";

/** @type {import("./provider.interface.js").ProviderLimits} */
export const LIMITS = {
  rpm: 15,
  rpd: 250,
  tpm: 250_000,
};

/**
 * Build the Gemini REST request body.
 * Gemini uses a "contents" array with "parts"; system instruction is separate.
 *
 * @param {import("./provider.interface.js").ProviderRequest} req
 * @returns {object}
 */
function buildBody(req) {
  return {
    system_instruction: {
      parts: [{ text: req.systemPrompt }],
    },
    contents: [
      {
        role: "user",
        parts: [{ text: req.userPrompt }],
      },
    ],
    generationConfig: {
      maxOutputTokens: req.maxTokens ?? 1200,
      temperature: 0.2,        // Low temp: consistent structured output
      topP: 0.8,
      responseMimeType: "application/json", // Force JSON mode
    },
  };
}

/**
 * GeminiProvider — implements AIProvider.
 * Instantiate with an API key; call .complete() to generate.
 */
export class GeminiProvider {
  /** @param {string} apiKey */
  constructor(apiKey) {
    if (!apiKey) throw new Error("GEMINI_API_KEY is required");
    this.apiKey = apiKey;
    this.name   = MODEL;
  }

  /** @returns {import("./provider.interface.js").ProviderLimits} */
  getLimits() {
    return LIMITS;
  }

  /**
   * Send a request to Gemini and return the response.
   *
   * @param {import("./provider.interface.js").ProviderRequest} req
   * @returns {Promise<import("./provider.interface.js").ProviderResponse>}
   */
  async complete(req) {
    const url  = `${API_BASE}/${MODEL}:generateContent?key=${this.apiKey}`;
    const body = buildBody(req);

    const res = await fetch(url, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(body),
      signal:  AbortSignal.timeout(30_000), // 30s hard timeout
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      throw new GeminiError(res.status, errText);
    }

    const data = await res.json();

    // Extract text from Gemini's nested response structure
    const candidate = data.candidates?.[0];
    if (!candidate) throw new GeminiError(0, "No candidates in Gemini response");

    const text = candidate.content?.parts
      ?.map((p) => p.text ?? "")
      .join("") ?? "";

    const inputTokens  = data.usageMetadata?.promptTokenCount     ?? 0;
    const outputTokens = data.usageMetadata?.candidatesTokenCount ?? 0;

    log.debug(`[gemini] tokens in=${inputTokens} out=${outputTokens}`);

    return { text, inputTokens, outputTokens };
  }
}

/** Typed error for Gemini API failures */
export class GeminiError extends Error {
  constructor(status, body) {
    super(`Gemini API error ${status}: ${body}`);
    this.name   = "GeminiError";
    this.status = status;
    this.body   = body;
    // Retryable: 429 (rate limit) and 5xx (server errors)
    this.retryable = status === 429 || status >= 500;
  }
}

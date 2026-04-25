/**
 * provider.interface.js — AI Provider Contract
 *
 * All AI providers (Gemini, OpenRouter, local models) must implement
 * this interface. The rest of the system talks ONLY to this contract —
 * never to a specific SDK.
 *
 * To add a new provider:
 *   1. Create src/ai/providers/my-provider.js
 *   2. Implement the AIProvider interface below
 *   3. Export it from src/ai/index.js
 *
 * Nothing else changes.
 */

/**
 * @typedef {Object} AIProvider
 *
 * @property {string} name
 *   Human-readable provider name (e.g. "gemini-2.5-flash")
 *
 * @property {function(ProviderRequest): Promise<ProviderResponse>} complete
 *   Send a single prompt, return structured text.
 *
 * @property {function(): ProviderLimits} getLimits
 *   Return the rate/quota limits for this provider.
 */

/**
 * @typedef {Object} ProviderRequest
 * @property {string}  systemPrompt   — role/persona instruction
 * @property {string}  userPrompt     — the actual request
 * @property {number}  [maxTokens]    — response length cap
 */

/**
 * @typedef {Object} ProviderResponse
 * @property {string}  text           — raw response text
 * @property {number}  inputTokens    — tokens consumed by input
 * @property {number}  outputTokens   — tokens consumed by output
 */

/**
 * @typedef {Object} ProviderLimits
 * @property {number}  rpm   — requests per minute
 * @property {number}  rpd   — requests per day
 * @property {number}  tpm   — tokens per minute
 */

// This file is documentation + JSDoc only.
// Import concrete providers from src/ai/providers/*.js

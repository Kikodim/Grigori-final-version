# Grigori Scoring Logic

Grigori by oryth.io uses heuristic intelligence scoring to prioritize events, explain confidence, and summarize market pressure. These scores are designed to support strategic monitoring, not prediction certainty.

## 1. Event Importance Score

Event importance is driven by a blend of:

- event tone
- source count
- source quality
- recency
- scenario impact tags
- strategic region relevance
- chokepoint / trade-route sensitivity

Primary code paths:

- [/Users/kirildimitrov/grigori/pipeline.js](/Users/kirildimitrov/grigori/pipeline.js)
- [/Users/kirildimitrov/grigori/event-insights.js](/Users/kirildimitrov/grigori/event-insights.js)
- [/Users/kirildimitrov/grigori/grigori-globe.jsx](/Users/kirildimitrov/grigori/grigori-globe.jsx)

## 2. Confidence Calculation

Confidence is not a black box. It is based on:

- number of source signals
- independent source domains
- average source trust
- recency of reporting
- location confidence
- whether the event is AI-enriched or rule-based

Frontend confidence explanations are assembled from deterministic rules in:

- [/Users/kirildimitrov/grigori/event-insights.js](/Users/kirildimitrov/grigori/event-insights.js)

## 3. Tone Determination

Tone is derived from language cues in:

- title
- summaries
- keywords
- clustered article text

Common patterns:

- escalation terms push toward `Escalating`
- diplomatic / stabilization language pushes toward `De-escalating`
- otherwise `Stable`

Relevant logic:

- [/Users/kirildimitrov/grigori/rule-based-briefing.js](/Users/kirildimitrov/grigori/rule-based-briefing.js)

## 4. Market Impact Scores

Market impact scores are directional intelligence signals for:

- Oil
- Shipping
- Defense
- Tech
- Equities sentiment

These are derived from:

- event scenario probabilities
- oil / market / trade-route impact tags
- sector exposure tags
- aggregated event pressure in the active time window

Relevant logic:

- [/Users/kirildimitrov/grigori/event-insights.js](/Users/kirildimitrov/grigori/event-insights.js)

## 5. Scenario Probabilities

Scenario probabilities are estimates, not verified statistical probabilities.

They come from:

- Gemini enrichment when available
- deterministic rule-based fallback when AI is unavailable or budget-limited

Rule-based scenarios are intentionally simple:

- escalation / disruption
- stabilization / containment

Relevant logic:

- [/Users/kirildimitrov/grigori/ai.js](/Users/kirildimitrov/grigori/ai.js)
- [/Users/kirildimitrov/grigori/rule-based-briefing.js](/Users/kirildimitrov/grigori/rule-based-briefing.js)

## 6. AI vs Rule-Based

Event intelligence status can be:

- `enriched`
- `cached`
- `fallback`
- `budget_exhausted`

Meaning:

- `enriched`: Gemini produced the event analysis
- `cached`: prior Gemini output was reused
- `fallback`: deterministic rule-based briefing was used
- `budget_exhausted`: rule-based fallback used because automation budget was exhausted

Relevant logic:

- [/Users/kirildimitrov/grigori/pipeline.js](/Users/kirildimitrov/grigori/pipeline.js)
- [/Users/kirildimitrov/grigori/ai.js](/Users/kirildimitrov/grigori/ai.js)

## 7. Location Confidence

Location confidence is inferred from:

- existing clustered location
- title and summary geography
- recurring place/entity keywords
- known strategic-region mappings

If location cannot be supported well enough:

- label becomes `Region under review`
- confidence is set low

Relevant logic:

- [/Users/kirildimitrov/grigori/event-insights.js](/Users/kirildimitrov/grigori/event-insights.js)
- [/Users/kirildimitrov/grigori/pipeline.js](/Users/kirildimitrov/grigori/pipeline.js)
- [/Users/kirildimitrov/grigori/ai.js](/Users/kirildimitrov/grigori/ai.js)

## 8. Data Sources That Influence Scoring

Depending on what is configured, Grigori may use:

- GDELT
- RSS
- NewsData.io
- Currents
- NewsAPI
- optional X / social signals from monitored accounts
- stored event history
- scenario tags
- source-domain trust heuristics

## 8A. X / Social Signals

Optional X signals are treated as early-warning inputs, not confirmed intelligence on their own.

Rules:

- X-only content defaults to low confidence
- X content can become medium confidence only when partially corroborated by existing event/news signals
- X content can become high-confidence context only when multiple independent reputable sources corroborate the same signal
- social signals can increase speed / recency awareness, but they do not by themselves prove an event

Relevant logic:

- [/Users/kirildimitrov/grigori/sources/social/x.adapter.js](/Users/kirildimitrov/grigori/sources/social/x.adapter.js)
- [/Users/kirildimitrov/grigori/layers.js](/Users/kirildimitrov/grigori/layers.js)
- [/Users/kirildimitrov/grigori/grigori-globe.jsx](/Users/kirildimitrov/grigori/grigori-globe.jsx)

## 9. Limitations

- Scores are heuristic, not statistical proof.
- Scenario probabilities are approximate.
- Rule-based logic can miss nuance.
- Source trust heuristics are broad and not a substitute for analyst review.
- Location inference can remain uncertain.
- Social signals can be noisy, misleading, or incomplete without corroboration.

## 10. Disclaimers

- This is not financial advice.
- Scores are directional intelligence signals, not guaranteed forecasts.
- Scenario probabilities are estimates, not verified statistical probabilities.

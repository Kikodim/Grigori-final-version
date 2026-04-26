import { useCallback, useEffect, useMemo, useState } from "react";
import {
  deriveImportance,
  deriveRiskLevel,
  explainConfidence,
  getEventSourceSignals,
  getMarketImpactTags,
} from "./event-insights.js";

const EVENTS_ENDPOINT = "/api/v1/events?limit=50";
const DISPLAY_FONT = "'Rajdhani', 'Space Grotesk', sans-serif";
const BODY_FONT = "'Inter', 'Space Grotesk', sans-serif";
const MONO_FONT = "'Share Tech Mono', 'IBM Plex Mono', monospace";
const APP_VIEWS = [
  { key: "globe", label: "Globe" },
  { key: "classic", label: "Intel Board" },
  { key: "reports", label: "Personalized Reports" },
];

function resolveBackendUrl(path) {
  if (typeof window === "undefined") return path;
  if (window.__GRIGORI_API_BASE) return `${window.__GRIGORI_API_BASE}${path}`;
  return path;
}

function mapToneColor(tone) {
  if (tone === "Escalating") return "#ff6b6b";
  if (tone === "De-escalating") return "#58e38f";
  return "#7fb8dd";
}

function mapAiStatusLabel(aiStatus) {
  if (aiStatus === "enriched") return "AI enriched";
  if (aiStatus === "cached") return "Cached intelligence";
  if (aiStatus === "budget_exhausted") return "Rule-based briefing, AI budget exhausted";
  return "Rule-based briefing";
}

function normalizeScenario(scenario) {
  const impact = scenario?.impact ?? {};
  return {
    name: scenario?.name ?? "Monitoring Scenario",
    probability: Number.isFinite(Number(scenario?.probability)) ? Number(scenario.probability) : 50,
    description: scenario?.description ?? "Rule-based scenario derived from source signals.",
    impact: {
      oil: impact.oil ?? "Neutral",
      markets: impact.markets ?? "Neutral",
      sectors: Array.isArray(impact.sectors) ? impact.sectors : [],
    },
  };
}

function mapEvent(event) {
  const sourceSignals = getEventSourceSignals(event);
  const scenarios = Array.isArray(event.scenarios) && event.scenarios.length > 0
    ? event.scenarios.map(normalizeScenario)
    : [
        {
          name: "Escalation / Disruption",
          probability: 55,
          description: "Escalation pressure remains visible across the source cluster, with disruption risk still elevated.",
          impact: { oil: "Neutral", markets: "Risk-off", sectors: [] },
        },
        {
          name: "Stabilization / Containment",
          probability: 45,
          description: "Containment signals hold and the event remains monitored without broader spillover.",
          impact: { oil: "Neutral", markets: "Neutral", sectors: [] },
        },
      ];

  return {
    ...event,
    location: event.location ?? { label: "Unknown Region", lat: null, lng: null },
    summary: event.summary ?? "Rule-based briefing generated from source signals.",
    developments: Array.isArray(event.developments) ? event.developments : [],
    tone: event.tone ?? "Stable",
    confidence: event.confidence ?? "Low",
    importanceScore: Number(event.importanceScore ?? event.importance_score ?? deriveImportance(event)),
    sourceSignals,
    scenarios,
    aiStatusLabel: mapAiStatusLabel(event.aiStatus ?? event.ai_status ?? "fallback"),
    riskLevel: deriveRiskLevel(event),
    confidenceExplanation: explainConfidence(event),
    marketImpactTags: getMarketImpactTags(event),
    sectorsImpacted: [...new Set(scenarios.flatMap((scenario) => scenario.impact.sectors ?? []))],
  };
}

function StatusBadge({ color, children }) {
  return (
    <span style={{
      background: `${color}14`,
      border: `1px solid ${color}3d`,
      color,
      borderRadius: 999,
      padding: "5px 11px",
      fontSize: 10,
      fontFamily: MONO_FONT,
      letterSpacing: "0.14em",
      textTransform: "uppercase",
      whiteSpace: "nowrap",
    }}>
      {children}
    </span>
  );
}

function SourcePill({ children }) {
  return (
    <span style={{
      background: "rgba(11,24,43,0.78)",
      border: "1px solid rgba(87, 216, 255, 0.18)",
      color: "#9dc8e7",
      borderRadius: 999,
      padding: "5px 10px",
      fontSize: 10,
      fontFamily: MONO_FONT,
      letterSpacing: "0.08em",
    }}>
      {children}
    </span>
  );
}

function HeaderNav({ activeView, onNavigate }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      {APP_VIEWS.map((item) => {
        const active = activeView === item.key;
        return (
          <button
            key={item.key}
            onClick={() => onNavigate?.(item.key)}
            style={{
              border: "none",
              borderBottom: `2px solid ${active ? "rgba(87,216,255,0.95)" : "transparent"}`,
              background: "transparent",
              color: active ? "#73ebff" : "rgba(214, 230, 244, 0.72)",
              padding: "12px 4px 10px",
              minWidth: item.key === "reports" ? 152 : 84,
              cursor: "pointer",
              fontFamily: MONO_FONT,
              fontSize: 11,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

function EmptyState({ title, body, action }) {
  return (
    <div style={{
      minHeight: "60vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "column",
      gap: 14,
      color: "#94a3b8",
      textAlign: "center",
      padding: 24,
    }}>
      <div style={{ color: "#edf6ff", fontSize: 24, fontWeight: 700, fontFamily: DISPLAY_FONT, letterSpacing: "0.05em" }}>{title}</div>
      <div style={{ maxWidth: 560, lineHeight: 1.75, fontFamily: BODY_FONT }}>{body}</div>
      {action}
    </div>
  );
}

function IntelCard({ event }) {
  const toneColor = mapToneColor(event.tone);

  return (
    <article style={{
      background: "linear-gradient(180deg, rgba(6,13,25,0.96) 0%, rgba(8,16,30,0.98) 100%)",
      border: "1px solid rgba(83, 148, 182, 0.18)",
      borderRadius: 20,
      padding: 22,
      display: "flex",
      flexDirection: "column",
      gap: 18,
      boxShadow: "0 18px 44px rgba(2, 8, 23, 0.4)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: toneColor, boxShadow: `0 0 10px ${toneColor}` }} />
            <span style={{ color: "#68dff6", fontSize: 10, fontFamily: MONO_FONT, letterSpacing: "0.18em", textTransform: "uppercase" }}>
              {event.location.label}
            </span>
            <span style={{ color: "#334155" }}>·</span>
            <span style={{ color: "#6f8498", fontSize: 10, fontFamily: MONO_FONT }}>
              {new Date(event.timestamp).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", year: "numeric", timeZone: "UTC" })} UTC
            </span>
          </div>
          <h2 style={{ color: "#f8fafc", fontSize: 24, lineHeight: 1.15, margin: 0, fontFamily: DISPLAY_FONT, letterSpacing: "0.03em" }}>
            {event.title}
          </h2>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: 8, alignContent: "flex-start" }}>
          <StatusBadge color={toneColor}>{event.tone}</StatusBadge>
          <StatusBadge color={event.confidence === "High" ? "#58e38f" : event.confidence === "Medium" ? "#fbbf24" : "#7fb8dd"}>
            Confidence: {event.confidence}
          </StatusBadge>
          <StatusBadge color={event.riskLevel === "Critical" ? "#ff6b6b" : event.riskLevel === "High" ? "#f97316" : event.riskLevel === "Watch" ? "#fbbf24" : "#7fb8dd"}>
            Risk: {event.riskLevel}
          </StatusBadge>
          <StatusBadge color="#c084fc">Importance: {Math.round(event.importanceScore)}</StatusBadge>
          <StatusBadge color="#22d3ee">{event.aiStatusLabel}</StatusBadge>
        </div>
      </div>

      <div style={{ color: "#c6d5e3", fontSize: 15, lineHeight: 1.8, fontFamily: BODY_FONT }}>
        {event.summary}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 18 }}>
        <section style={{ background: "rgba(3,10,22,0.72)", border: "1px solid rgba(83, 148, 182, 0.16)", borderRadius: 16, padding: 16 }}>
          <div style={{ color: "#68dff6", fontSize: 10, fontFamily: MONO_FONT, letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 10 }}>
            Developments
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {(event.developments.length > 0 ? event.developments : ["Rule-based briefing generated from source signals."]).map((development, index) => (
              <div key={index} style={{ display: "flex", gap: 10 }}>
                <span style={{ color: "#38bdf8", fontFamily: "monospace", marginTop: 2 }}>▸</span>
                <span style={{ color: "#cbd5e1", lineHeight: 1.65, fontFamily: BODY_FONT }}>{development}</span>
              </div>
            ))}
          </div>
        </section>

        <section style={{ background: "rgba(3,10,22,0.72)", border: "1px solid rgba(83, 148, 182, 0.16)", borderRadius: 16, padding: 16 }}>
          <div style={{ color: "#68dff6", fontSize: 10, fontFamily: MONO_FONT, letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 10 }}>
            Confidence & Sources
          </div>
          <div style={{ color: "#cbd5e1", lineHeight: 1.7, marginBottom: 12, fontFamily: BODY_FONT }}>
            {event.confidenceExplanation}
          </div>
          <div style={{ color: "#94a3b8", fontFamily: MONO_FONT, fontSize: 11, marginBottom: 8 }}>
            Sources: {event.sourceSignals.uniqueSources.slice(0, 3).join(", ") || "No named sources"}
          </div>
          <div style={{ color: "#94a3b8", fontFamily: MONO_FONT, fontSize: 11 }}>
            Signals: {event.sourceSignals.sourceCount} sources / {event.sourceSignals.corroboratedCount} corroborated
          </div>
        </section>
      </div>

      <section style={{ background: "rgba(3,10,22,0.72)", border: "1px solid rgba(83, 148, 182, 0.16)", borderRadius: 16, padding: 16 }}>
        <div style={{ color: "#68dff6", fontSize: 10, fontFamily: MONO_FONT, letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 12 }}>
          Possible Scenarios
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
          {event.scenarios.map((scenario, index) => (
            <div key={`${event.id}-${index}`} style={{ background: "rgba(12,22,38,0.74)", border: "1px solid rgba(83, 148, 182, 0.14)", borderRadius: 14, padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 8 }}>
                <div style={{ color: "#f8fafc", fontWeight: 700, fontFamily: DISPLAY_FONT, letterSpacing: "0.04em" }}>{scenario.name}</div>
                <StatusBadge color={scenario.probability >= 55 ? "#58e38f" : scenario.probability >= 35 ? "#fbbf24" : "#fb7185"}>
                  {scenario.probability}%
                </StatusBadge>
              </div>
              <div style={{ color: "#cbd5e1", lineHeight: 1.65, marginBottom: 10, fontFamily: BODY_FONT }}>
                {scenario.description}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <SourcePill>Oil: {scenario.impact.oil}</SourcePill>
                <SourcePill>Markets: {scenario.impact.markets}</SourcePill>
                {(scenario.impact.sectors ?? []).map((sector) => (
                  <SourcePill key={sector}>{sector}</SourcePill>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        <div style={{ background: "rgba(3,10,22,0.72)", border: "1px solid rgba(83, 148, 182, 0.16)", borderRadius: 16, padding: 16 }}>
          <div style={{ color: "#68dff6", fontSize: 10, fontFamily: MONO_FONT, letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 10 }}>
            Sectors Impacted
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {(event.sectorsImpacted.length > 0 ? event.sectorsImpacted : event.marketImpactTags).map((sector) => (
              <SourcePill key={sector}>{sector}</SourcePill>
            ))}
          </div>
        </div>
        <div style={{ background: "rgba(3,10,22,0.72)", border: "1px solid rgba(83, 148, 182, 0.16)", borderRadius: 16, padding: 16 }}>
          <div style={{ color: "#68dff6", fontSize: 10, fontFamily: MONO_FONT, letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 10 }}>
            Sources
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {event.sourceSignals.uniqueSources.map((source) => (
              <SourcePill key={source}>{source}</SourcePill>
            ))}
          </div>
        </div>
      </section>
    </article>
  );
}

export default function ClassicIntelBoard({ activeView = "classic", onNavigate }) {
  const [events, setEvents] = useState([]);
  const [loadState, setLoadState] = useState({ status: "loading", message: "Loading Grigori Intelligence Systems..." });
  const [refreshState, setRefreshState] = useState({ status: "idle", message: "" });

  const loadEvents = useCallback(async () => {
    setLoadState({ status: "loading", message: "Loading Grigori Intelligence Systems..." });
    const res = await fetch(resolveBackendUrl(EVENTS_ENDPOINT), { signal: AbortSignal.timeout(8000) });
    if (!res.ok) {
      throw new Error(`Failed to load events (${res.status})`);
    }

    const data = await res.json();
    const mapped = Array.isArray(data.events) ? data.events.map(mapEvent) : [];
    setEvents(mapped);
    setLoadState(
      mapped.length > 0
        ? { status: "ready", message: "" }
        : { status: "empty", message: "No events available yet." }
    );
  }, []);

  useEffect(() => {
    loadEvents().catch((err) => {
      setEvents([]);
      setLoadState({ status: "error", message: err.message || "Unable to load events." });
    });
    const interval = setInterval(() => {
      loadEvents().catch((err) => {
        setEvents([]);
        setLoadState({ status: "error", message: err.message || "Unable to load events." });
      });
    }, 60_000);
    return () => clearInterval(interval);
  }, [loadEvents]);

  const counts = useMemo(() => events.reduce((acc, event) => {
    acc.total += 1;
    if (event.tone === "Escalating") acc.escalating += 1;
    if (event.aiStatusLabel.includes("Rule-based")) acc.ruleBased += 1;
    return acc;
  }, { total: 0, escalating: 0, ruleBased: 0 }), [events]);

  const handleAdminRefresh = useCallback(async () => {
    const secret = window.prompt("Enter ADMIN_SECRET to refresh the pipeline.");
    if (!secret) return;

    setRefreshState({ status: "running", message: "Triggering refresh..." });
    try {
      const res = await fetch(resolveBackendUrl("/api/v1/admin/refresh"), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secret}`,
          "Content-Type": "application/json",
        },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? `Request failed with ${res.status}`);
      }

      await loadEvents();
      setRefreshState({ status: "success", message: "Intel board updated." });
      window.setTimeout(() => setRefreshState({ status: "idle", message: "" }), 4000);
    } catch (err) {
      setRefreshState({ status: "error", message: err.message });
    }
  }, [loadEvents]);

  return (
    <div style={{
      minHeight: "100vh",
      background: "radial-gradient(circle at top, rgba(14, 165, 233, 0.08), transparent 28%), linear-gradient(180deg, #020817 0%, #061120 100%)",
      color: "#e2e8f0",
      padding: "112px 24px 40px",
      fontFamily: BODY_FONT,
    }}>
      <div style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        background: "linear-gradient(180deg, rgba(4,9,18,0.95) 0%, rgba(4,10,22,0.88) 100%)",
        backdropFilter: "blur(18px)",
        borderBottom: "1px solid rgba(87, 216, 255, 0.12)",
        padding: "16px 24px 14px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 16,
        flexWrap: "wrap",
      }}>
        <div>
          <div style={{ color: "#f8fafc", fontFamily: DISPLAY_FONT, fontSize: 30, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", lineHeight: 1 }}>
            Grigori
          </div>
          <div style={{ color: "rgba(191,219,254,0.78)", fontFamily: BODY_FONT, fontSize: 13, letterSpacing: "0.06em", marginTop: 4 }}>
            by oryth.io
          </div>
          <div style={{ color: "#70d7f2", fontFamily: MONO_FONT, fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", marginTop: 8 }}>
            Strategic Intelligence Dashboard
          </div>
        </div>
        <div style={{ display: "grid", gap: 12, justifyItems: "end" }}>
          <HeaderNav activeView={activeView} onNavigate={onNavigate} />
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <SourcePill>{counts.total} events</SourcePill>
          <SourcePill>{counts.escalating} escalating</SourcePill>
          <SourcePill>{counts.ruleBased} rule-based</SourcePill>
          <StatusBadge color="#4ed69f">Operational</StatusBadge>
          <button
            onClick={handleAdminRefresh}
            disabled={refreshState.status === "running"}
            style={{
              border: "1px solid rgba(87,216,255,0.24)",
              borderRadius: 999,
              background: refreshState.status === "success" ? "rgba(16, 185, 129, 0.18)" : "rgba(8,16,30,0.82)",
              color: "#e2e8f0",
              padding: "10px 14px",
              cursor: refreshState.status === "running" ? "wait" : "pointer",
              fontFamily: MONO_FONT,
              textTransform: "uppercase",
              letterSpacing: "0.12em",
              fontSize: 10,
            }}
          >
            {refreshState.status === "running" ? "Refreshing..." : "Admin Refresh"}
          </button>
          </div>
        </div>
      </div>

      {refreshState.message ? (
        <div style={{ marginBottom: 18, color: refreshState.status === "error" ? "#fda4af" : "#93c5fd", fontFamily: MONO_FONT, fontSize: 12 }}>
          {refreshState.message}
        </div>
      ) : null}

      {loadState.status === "loading" ? (
        <EmptyState title="Loading Grigori Intelligence Systems..." body="Pulling live events and rule-based briefings from /api/v1/events." />
      ) : null}

      {loadState.status === "error" ? (
        <EmptyState
          title="Unable To Load Events"
          body={loadState.message}
          action={(
            <button onClick={() => loadEvents().catch((err) => setLoadState({ status: "error", message: err.message || "Unable to load events." }))} style={{
              border: "1px solid rgba(56,189,248,0.4)",
              borderRadius: 999,
              background: "rgba(15,23,42,0.8)",
              color: "#e2e8f0",
              padding: "10px 16px",
              cursor: "pointer",
              fontFamily: "monospace",
            }}>
              Retry
            </button>
          )}
        />
      ) : null}

      {loadState.status === "empty" ? (
        <EmptyState title="No Events Yet" body="The board is live, but there are no saved events to display right now." />
      ) : null}

      {loadState.status === "ready" ? (
        <div style={{ display: "grid", gap: 20 }}>
          {events.map((event) => (
            <IntelCard key={event.id} event={event} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

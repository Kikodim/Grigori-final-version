import { BRAND } from "../premium-config.js";

const DISPLAY_FONT = "'Rajdhani', 'Space Grotesk', sans-serif";
const BODY_FONT = "'Inter', 'Space Grotesk', system-ui, sans-serif";
const MONO_FONT = "'Share Tech Mono', 'IBM Plex Mono', monospace";

export const SITE_ORIGIN = "https://grigori.oryth.io";
export const DEFAULT_META = {
  title: "Grigori by oryth.io | Strategic Intelligence Dashboard",
  description: "Live geopolitical risk monitoring, OSINT signals, scenario analysis, market-impact context, and strategic intelligence reports.",
  image: `${SITE_ORIGIN}/assets/og/grigori-og.png`,
};

export const SEO_ROUTE_CONFIG = {
  "/geopolitical-risk-dashboard": {
    title: "Geopolitical Risk Dashboard | Grigori by oryth.io",
    description: "Monitor geopolitical risk, chokepoints, sanctions, elections, energy stress, and strategic signals through Grigori’s live intelligence dashboard.",
    h1: "Geopolitical Risk Dashboard",
    eyebrow: "Live Strategic Monitoring",
    ctaPrimary: { label: "Open Live Dashboard", route: "/" },
    ctaSecondary: { label: "View Intel Board", route: "/intel" },
    sections: [
      {
        heading: "What is Grigori?",
        body: "Grigori by oryth.io is a live geopolitical risk dashboard built for people who need fast strategic awareness without drowning in noise. It combines open-source reporting, event clustering, scenario framing, market-impact context, and operator-friendly visual monitoring into a single intelligence surface. Instead of acting like a generic news reader, Grigori is designed to answer the practical question behind every fast-moving headline: what changed, why does it matter, and what should be watched next. The product is useful when risk is distributed across military activity, election pressure, infrastructure disruptions, cyber incidents, sanctions negotiations, chokepoint stress, and regional political instability rather than a single declared conflict."
      },
      {
        heading: "Key features",
        body: "The dashboard emphasizes live signals that can affect decision-making. Users can monitor a dark-globe operational surface, review an Active Signals queue, open event briefs with structured assessment, and inspect scenario-based market implications without turning the product into a trading terminal. Grigori also tracks freshness and enrichment state, making it clear when news was checked, when AI reviewed a high-priority event, and whether a board is current even if no new relevant articles appeared. This is especially valuable in periods where the absence of change matters almost as much as a new escalation."
      },
      {
        heading: "Who it is for",
        body: "Grigori is designed for operators, analysts, founders, investors, journalists, researchers, and strategic teams that need a disciplined geopolitical risk picture. It is particularly relevant for energy desks, macro and event-driven investors, OSINT practitioners, security teams, shipping and supply-chain analysts, and decision-makers who need to brief clients or internal stakeholders quickly. The interface is also built to be legible under pressure, so that a user can move from live map to briefing, from event queue to scenario view, and from market context to source trace without switching products."
      },
      {
        heading: "Use cases",
        body: "Typical use cases include monitoring the Strait of Hormuz, the Black Sea, the Red Sea, Taiwan, EU political pressure, Balkan instability, sanctions policy, migration stress, election unrest, and critical infrastructure incidents. A team might use Grigori to evaluate whether a military incident looks contained or whether it is beginning to affect shipping, insurance, energy pricing, or broader equity sentiment. Another team may use it to maintain an executive morning brief, identify stale versus fresh risk signals, or separate high-impact geopolitical events from low-value media churn."
      },
      {
        heading: "Early access reports",
        body: "Beyond the live dashboard, Grigori supports personalized intelligence reporting in private preview. These reports are intended for users who want a more curated product output: executive summaries, scenario framing, watch indicators, and strategic implications tailored to their regions, sectors, and recurring themes. The reports layer is designed to extend the dashboard rather than replace it. Users can track live signals during the day, then request a more deliberate written intelligence product when a board-level or client-ready output is needed."
      },
      {
        heading: "Disclaimer",
        body: "Grigori surfaces OSINT signals and structured intelligence summaries for situational awareness. It is not financial advice, not a substitute for primary reporting, and not a claim of certainty about future outcomes. The product is meant to improve orientation, prioritization, and follow-up, especially when the signal environment is fragmented and rapidly evolving."
      },
    ],
  },
  "/osint-dashboard": {
    title: "OSINT Dashboard for Strategic Risk | Grigori by oryth.io",
    description: "A premium OSINT dashboard for geopolitical monitoring, live signal triage, source transparency, scenario analysis, and decision-ready strategic context.",
    h1: "OSINT Dashboard for Strategic Risk",
    eyebrow: "Open-Source Intelligence Workflow",
    ctaPrimary: { label: "Try the Live Dashboard", route: "/" },
    ctaSecondary: { label: "Join Early Access", route: "/personalized-intelligence-reports" },
    sections: [
      {
        heading: "What is Grigori?",
        body: "Grigori is an OSINT dashboard purpose-built for geopolitical and market-sensitive monitoring. It does not try to replace primary research, and it does not present scraped article fragments as finished intelligence. Instead, it turns distributed source signals into a more structured operating picture: what happened, where it is happening, how fresh the signal is, how much corroboration exists, and which scenarios deserve attention. The result is a system that feels closer to an analyst workstation than a breaking-news feed."
      },
      {
        heading: "Key features",
        body: "Users can inspect live signals on a globe, open event detail panels, compare scenario paths, and review source quality and corroboration without losing the thread of the overall board. Grigori also surfaces whether a signal is AI enriched, rule-based, cached, or unchanged after a refresh, which matters for trust and operating tempo. The system supports geopolitical, political, energy, cyber, infrastructure, election, shipping, and regulatory signals, so it works for broader strategic intelligence rather than only conventional conflict monitoring."
      },
      {
        heading: "Who it is for",
        body: "This OSINT workflow is relevant for research teams, security operations, news desks, macro and geopolitical investors, policy analysts, logistics operators, and founders who need a disciplined way to monitor changing risk conditions. It is especially useful when signal quality varies across providers and the challenge is less about raw access than about triage, clustering, freshness, and consistent framing. Teams that currently juggle feeds, spreadsheets, and ad hoc chat summaries can use Grigori as a cleaner central reference point."
      },
      {
        heading: "Use cases",
        body: "Examples include following EU sanctions negotiations, tracking election risk in Southeastern Europe, watching cyber incidents with possible state significance, monitoring supply-chain stress, and comparing how separate regional events may converge into broader market sensitivity. A user can stay on the live globe for situational awareness, pivot to the Intel Board for more linear review, and then inspect sources separately to understand the confidence profile behind a signal. This makes Grigori useful both for rapid monitoring and for producing defensible internal notes."
      },
      {
        heading: "Early access reports",
        body: "The reports layer extends the OSINT workflow into a more narrative product for teams that need recurring written output. Instead of copying source text, Grigori is being shaped toward concise analyst-style reporting with watch indicators, scenario logic, and source transparency. Early access users can help shape how executive summaries, sector-specific lenses, and daily reporting packs are prioritized."
      },
      {
        heading: "Disclaimer",
        body: "Grigori uses open-source intelligence signals and structured summaries for context and prioritization. It does not promise exhaustive coverage, and it should not be treated as legal, investment, or operational advice without further verification."
      },
    ],
  },
  "/strategic-intelligence-dashboard": {
    title: "Strategic Intelligence Dashboard | Grigori by oryth.io",
    description: "Strategic intelligence dashboard for live geopolitical signals, scenario analysis, chokepoint monitoring, and market-impact context across global risk hotspots.",
    h1: "Strategic Intelligence Dashboard",
    eyebrow: "Decision Support for Fast-Moving Risk",
    ctaPrimary: { label: "Open the Strategic Dashboard", route: "/" },
    ctaSecondary: { label: "Explore Reports", route: "/reports" },
    sections: [
      {
        heading: "What is Grigori?",
        body: "Grigori is a strategic intelligence dashboard designed to help users interpret live geopolitical developments in a decision-oriented way. Rather than focus only on the headline of the moment, it frames each signal through freshness, scenario risk, relevance, and potential spillover into markets, shipping, energy, technology, and regional stability. The product is built for continuous monitoring, but also for the recurring question that appears in briefings and boardrooms: what actually changed, and does it matter enough to escalate attention?"
      },
      {
        heading: "Key features",
        body: "Core features include a living Earth view, a priority-sorted Active Signals queue, a structured event detail panel, War Room summaries, and source-confidence context. The system also distinguishes between fresh updates, no-change refreshes, and filtered-out noise, which is critical when operating in environments where signals may be sparse, repetitive, or overhyped. Strategic users benefit from seeing not only a new event, but whether it altered the board in a meaningful way or simply confirmed what was already known."
      },
      {
        heading: "Who it is for",
        body: "Grigori is suited for strategic analysts, research teams, investors, risk managers, operations leaders, journalists, and executives who need a premium situational picture without the overhead of a full custom intelligence stack. It is also useful for smaller teams that want Palantir-style discipline around signals and scenarios, but in a lighter and more flexible product environment. Anyone who needs to synthesize geopolitical, energy, cyber, and policy developments into one coherent board can benefit from this format."
      },
      {
        heading: "Use cases",
        body: "Practical use cases include assessing whether tension in the Strait of Hormuz is moving from rhetoric into shipping stress, comparing the market relevance of a protest wave with a sanctions negotiation, monitoring Black Sea instability, or tracking whether election pressure in Europe is beginning to affect policy expectations. The dashboard can support morning briefings, intra-day alerts, strategic watchlists, and board-level preparation, especially when users need to move quickly from signal detection to structured interpretation."
      },
      {
        heading: "Early access reports",
        body: "Personalized reports are the next layer for users who want written intelligence tailored to their lens. A live board is essential for ongoing monitoring, but many teams also need a concise deliverable for clients, leadership, or partners. Grigori’s early access reports are aimed at that need: analyst-style summaries, scenario framing, and sector-aware risk interpretation that build directly on the signals already visible in the dashboard."
      },
      {
        heading: "Disclaimer",
        body: "Grigori provides OSINT-based strategic monitoring and scenario context. It is not a forecast engine, not a guarantee of market outcomes, and not financial advice. Users should treat it as a disciplined intelligence support tool that improves visibility and prioritization."
      },
    ],
  },
  "/personalized-intelligence-reports": {
    title: "Personalized Intelligence Reports | Grigori by oryth.io",
    description: "Preview Grigori’s personalized intelligence reports for geopolitical risk, executive briefs, scenario analysis, sector context, and early-access reporting workflows.",
    h1: "Personalized Intelligence Reports",
    eyebrow: "Private Preview",
    ctaPrimary: { label: "Join Early Access", route: "/reports" },
    ctaSecondary: { label: "Open Live Dashboard", route: "/" },
    sections: [
      {
        heading: "What is Grigori?",
        body: "Grigori is built around a live strategic intelligence dashboard, but some users need more than a board. They need a repeatable written product: something concise enough for executive review, detailed enough for analysts, and structured enough to distinguish fresh insight from repeated news noise. Personalized Intelligence Reports are Grigori’s answer to that need. They are designed to turn the live signal environment into a clearer narrative output without simply copying source articles or creating generic market commentary."
      },
      {
        heading: "Key features",
        body: "The reports layer is intended to support tailored briefs by region, theme, and sector. A report can emphasize geopolitical chokepoints, EU and Balkans developments, cyber and infrastructure incidents, energy policy stress, or market-sensitive escalation pathways depending on user priorities. The value is not only in summarization, but in the structure: executive summary, assessment, watch indicators, scenario analysis, and source-aware confidence framing. This makes the product more useful for teams that need repeatable outputs rather than only an interactive dashboard."
      },
      {
        heading: "Who it is for",
        body: "These reports are aimed at investment professionals, founders, operating teams, research analysts, journalists, and strategic decision-makers who want tailored written intelligence without building their own internal reporting pipeline. They are especially relevant for users who regularly brief clients, leadership, or partners and need a consistent product format. The live dashboard remains the operating surface, but the reports layer is where that monitoring becomes a more finished and portable output."
      },
      {
        heading: "Use cases",
        body: "Example use cases include preparing a morning geopolitical memo, writing a weekly market-sensitive risk note, supporting cross-border operating decisions, or producing a targeted report on one region such as the Black Sea, the Gulf, Southeastern Europe, or Taiwan. Another common use case is reducing the time between signal detection and decision-ready communication: instead of moving manually from dashboard to notes to presentation, users can rely on a structured reporting workflow built directly on the monitored events and scenarios."
      },
      {
        heading: "Early access reports",
        body: "Personalized Intelligence Reports are currently in private preview. Early-access users help shape the reporting workflow, output quality, and prioritization lenses. That includes how reports treat confidence, how sources are surfaced without article dumping, how sectors are emphasized, and how executive brevity is balanced with analyst depth. If you want reports that feel like a serious intelligence product rather than generic AI summaries, early access is the right way to influence the roadmap."
      },
      {
        heading: "Disclaimer",
        body: "Reports generated from Grigori are intended for OSINT-based situational awareness and strategic context. They are not legal, investment, or national-security advice, and they should be used alongside domain expertise and primary-source review."
      },
    ],
  },
};

export function getSeoRouteConfig(pathname) {
  return SEO_ROUTE_CONFIG[pathname] ?? null;
}

function HeaderButton({ children, onClick, primary = false }) {
  return (
    <button
      onClick={onClick}
      style={{
        minHeight: 42,
        padding: "0 18px",
        borderRadius: 999,
        border: `1px solid ${primary ? "rgba(87,216,255,0.3)" : "rgba(94,164,195,0.18)"}`,
        background: primary ? "rgba(56,189,248,0.14)" : "rgba(8,20,36,0.68)",
        color: primary ? "#a4f1ff" : "rgba(214,235,255,0.86)",
        fontFamily: MONO_FONT,
        fontSize: 11,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function SeoSection({ heading, body }) {
  return (
    <section style={{
      background: "linear-gradient(180deg, rgba(7,14,28,0.94) 0%, rgba(4,10,22,0.98) 100%)",
      border: "1px solid rgba(94,164,195,0.14)",
      borderRadius: 20,
      padding: 24,
      boxShadow: "0 22px 55px rgba(0,0,0,0.28)",
    }}>
      <h2 style={{ margin: "0 0 12px", color: "#f8fafc", fontFamily: DISPLAY_FONT, fontSize: 24, letterSpacing: "0.03em" }}>{heading}</h2>
      <p style={{ margin: 0, color: "rgba(214,235,255,0.78)", fontFamily: BODY_FONT, fontSize: 16, lineHeight: 1.78 }}>
        {body}
      </p>
    </section>
  );
}

export default function SeoLandingPage({ routeConfig, onNavigate }) {
  return (
    <div style={{
      minHeight: "100vh",
      background: "radial-gradient(circle at top, rgba(14, 165, 233, 0.08), transparent 24%), linear-gradient(180deg, #020817 0%, #061120 100%)",
      color: "#e2e8f0",
      fontFamily: BODY_FONT,
    }}>
      <div style={{
        position: "sticky",
        top: 0,
        zIndex: 20,
        backdropFilter: "blur(18px)",
        WebkitBackdropFilter: "blur(18px)",
        background: "linear-gradient(180deg, rgba(4,9,18,0.96) 0%, rgba(4,10,22,0.88) 100%)",
        borderBottom: "1px solid rgba(87,216,255,0.12)",
        padding: "calc(env(safe-area-inset-top, 0px) + 12px) 18px 12px",
      }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div>
            <div style={{ color: "#f8fafc", fontFamily: DISPLAY_FONT, fontSize: 28, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase" }}>Grigori</div>
            <div style={{ color: "rgba(191,219,254,0.76)", fontSize: 14, letterSpacing: "0.08em" }}>by oryth.io</div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <HeaderButton primary onClick={() => onNavigate?.("globe")}>Open Live Dashboard</HeaderButton>
            <HeaderButton onClick={() => onNavigate?.("classic")}>Intel Board</HeaderButton>
            <HeaderButton onClick={() => onNavigate?.("reports")}>Reports</HeaderButton>
          </div>
        </div>
      </div>

      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "40px 18px 80px" }}>
        <section style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.3fr) minmax(320px, 0.7fr)",
          gap: 24,
          alignItems: "stretch",
        }}>
          <div style={{
            background: "linear-gradient(180deg, rgba(7,14,28,0.96) 0%, rgba(4,10,22,0.98) 100%)",
            border: "1px solid rgba(94,164,195,0.16)",
            borderRadius: 24,
            padding: 28,
            boxShadow: "0 28px 80px rgba(0,0,0,0.32)",
          }}>
            <div style={{ color: "#7dd3fc", fontSize: 11, fontFamily: MONO_FONT, letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 12 }}>
              {routeConfig.eyebrow}
            </div>
            <h1 style={{ margin: 0, color: "#f8fafc", fontFamily: DISPLAY_FONT, fontSize: 46, lineHeight: 1.02, letterSpacing: "0.02em" }}>
              {routeConfig.h1}
            </h1>
            <p style={{ margin: "18px 0 0", color: "rgba(214,235,255,0.78)", fontSize: 18, lineHeight: 1.75, maxWidth: 760 }}>
              {routeConfig.description}
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 24 }}>
              <HeaderButton primary onClick={() => window.location.pathname = routeConfig.ctaPrimary.route}>{routeConfig.ctaPrimary.label}</HeaderButton>
              <HeaderButton onClick={() => window.location.pathname = routeConfig.ctaSecondary.route}>{routeConfig.ctaSecondary.label}</HeaderButton>
            </div>
          </div>

          <aside style={{
            background: "linear-gradient(180deg, rgba(5,12,24,0.96) 0%, rgba(7,15,29,0.98) 100%)",
            border: "1px solid rgba(94,164,195,0.16)",
            borderRadius: 24,
            padding: 22,
            boxShadow: "0 24px 60px rgba(0,0,0,0.28)",
            display: "grid",
            gap: 14,
          }}>
            <div style={{ color: "rgba(103,220,255,0.48)", fontSize: 10, fontFamily: MONO_FONT, letterSpacing: "0.16em", textTransform: "uppercase" }}>
              Why teams use Grigori
            </div>
            {[
              "Live geopolitical risk monitoring",
              "OSINT signal clustering and freshness tracking",
              "Scenario analysis with market-impact context",
              "Strategic intelligence reports in private preview",
              "Not financial advice; built for situational awareness",
            ].map((item) => (
              <div key={item} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <span style={{ color: "#57d8ff", marginTop: 2 }}>▸</span>
                <span style={{ color: "rgba(214,235,255,0.82)", fontSize: 14, lineHeight: 1.6 }}>{item}</span>
              </div>
            ))}
            <div style={{ marginTop: 10, borderTop: "1px solid rgba(94,164,195,0.12)", paddingTop: 14, color: "rgba(148,175,198,0.76)", fontSize: 13, lineHeight: 1.65 }}>
              {BRAND.description}
            </div>
          </aside>
        </section>

        <div style={{ display: "grid", gap: 22, marginTop: 28 }}>
          {routeConfig.sections.map((section) => (
            <SeoSection key={section.heading} heading={section.heading} body={section.body} />
          ))}
        </div>
      </main>
    </div>
  );
}

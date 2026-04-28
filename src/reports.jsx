import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { BRAND, PREMIUM_PLANS, REPORT_INPUT_OPTIONS, REPORT_OUTPUT_SECTIONS, REPORT_STATUS_BADGE, REPORTS_WIP_COPY } from "../premium-config.js";

const DISPLAY_FONT = "'Rajdhani', 'Space Grotesk', sans-serif";
const BODY_FONT = "'Inter', 'Space Grotesk', sans-serif";
const MONO_FONT = "'Share Tech Mono', 'IBM Plex Mono', monospace";
const APP_VIEWS = [
  { key: "globe", label: "Globe" },
  { key: "classic", label: "Intel Board" },
  { key: "reports", label: "Personalized Reports" },
];
const WAITLIST_FOCUS_OPTIONS = [
  "Investing / Markets",
  "Energy",
  "Shipping",
  "Defense",
  "Cyber",
  "EU / Balkans",
  "General Geopolitics",
];
const WAITLIST_TIER_OPTIONS = [
  { value: "confidential", label: "Confidential Clearance" },
  { value: "top_secret", label: "Top Secret Clearance" },
  { value: "not_sure", label: "Not sure yet" },
];

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
let browserSupabase = null;

function getSupabaseBrowserClient() {
  if (!supabaseUrl || !supabaseAnonKey) return null;
  if (!browserSupabase) {
    browserSupabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }
  return browserSupabase;
}

function resolveBackendUrl(path) {
  if (typeof window === "undefined") return path;
  if (window.__GRIGORI_API_BASE) return `${window.__GRIGORI_API_BASE}${path}`;
  return path;
}

async function authedFetch(path, accessToken, options = {}) {
  const headers = new Headers(options.headers ?? {});
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }
  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(resolveBackendUrl(path), {
    ...options,
    headers,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error ?? `Request failed with ${res.status}`);
  }
  return data;
}

function ShellCard({ title, eyebrow, children, accent = "rgba(125, 211, 252, 0.24)" }) {
  return (
    <section style={{
      background: "linear-gradient(180deg, rgba(7,14,28,0.96) 0%, rgba(4,10,22,0.98) 100%)",
      border: `1px solid ${accent}`,
      borderRadius: 20,
      padding: 24,
      boxShadow: "0 24px 70px rgba(0,0,0,0.32)",
    }}>
      {eyebrow ? (
        <div style={{ color: "#7dd3fc", fontSize: 10, fontFamily: MONO_FONT, letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 10 }}>
          {eyebrow}
        </div>
      ) : null}
      <div style={{ color: "#f8fafc", fontSize: 24, fontWeight: 700, lineHeight: 1.15, marginBottom: 14, fontFamily: DISPLAY_FONT, letterSpacing: "0.03em" }}>
        {title}
      </div>
      {children}
    </section>
  );
}

function PremiumBadge({ children, tone = "info" }) {
  const palette = tone === "warning"
    ? { color: "#fbbf24", border: "rgba(251,191,36,0.32)", bg: "rgba(251,191,36,0.12)" }
    : tone === "success"
      ? { color: "#5eead4", border: "rgba(94,234,212,0.32)", bg: "rgba(94,234,212,0.12)" }
      : { color: "#93c5fd", border: "rgba(147,197,253,0.28)", bg: "rgba(147,197,253,0.12)" };
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      padding: "6px 12px",
      borderRadius: 999,
      border: `1px solid ${palette.border}`,
      background: palette.bg,
      color: palette.color,
      fontFamily: MONO_FONT,
      fontSize: 10,
      letterSpacing: "0.14em",
      textTransform: "uppercase",
      whiteSpace: "nowrap",
    }}>
      {children}
    </span>
  );
}

function HeaderNav({ activeView, onNavigate }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", overflowX: "auto", maxWidth: "100%", paddingBottom: 2 }}>
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
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

function PlanCard({ plan, emphasized = false, actionLabel = "Coming Soon" }) {
  return (
    <div style={{
      border: `1px solid ${emphasized ? "rgba(125, 211, 252, 0.38)" : "rgba(51,65,85,0.92)"}`,
      background: emphasized ? "linear-gradient(180deg, rgba(8,18,36,0.98) 0%, rgba(10,24,44,0.98) 100%)" : "rgba(5,11,23,0.9)",
      borderRadius: 20,
      padding: 22,
      display: "flex",
      flexDirection: "column",
      gap: 14,
      minHeight: 320,
    }}>
      <div>
        <div style={{ color: "#7dd3fc", fontSize: 11, fontFamily: "monospace", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 10 }}>
          {plan.name}
        </div>
        <div style={{ color: "#f8fafc", fontSize: 28, fontFamily: "'Space Mono', monospace", fontWeight: 700 }}>
          {plan.priceLabel}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, color: "#cbd5e1", lineHeight: 1.6 }}>
        {plan.features.map((feature) => (
          <div key={feature} style={{ display: "flex", gap: 10 }}>
            <span style={{ color: "#67e8f9" }}>•</span>
            <span>{feature}</span>
          </div>
        ))}
      </div>
      <button style={{
        marginTop: "auto",
        border: "1px solid rgba(125,211,252,0.28)",
        borderRadius: 999,
        background: emphasized ? "rgba(56,189,248,0.16)" : "rgba(15,23,42,0.82)",
        color: "#f8fafc",
        padding: "11px 14px",
        fontFamily: "monospace",
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        cursor: "pointer",
      }}>
        {actionLabel}
      </button>
    </div>
  );
}

function AuthField({ label, type = "text", value, onChange, placeholder }) {
  return (
    <label style={{ display: "grid", gap: 8 }}>
          <span style={{ color: "#94a3b8", fontSize: 10, fontFamily: MONO_FONT, letterSpacing: "0.14em", textTransform: "uppercase" }}>{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        style={{
          background: "rgba(2, 8, 23, 0.72)",
          border: "1px solid rgba(51,65,85,0.95)",
          color: "#e2e8f0",
          borderRadius: 12,
          padding: "12px 14px",
          fontSize: 14,
        }}
      />
    </label>
  );
}

function InterestForm({ form, setForm, onSubmit, status }) {
  const labelStyle = { display: "grid", gap: 8 };
  const helperStyle = { color: "#94a3b8", fontSize: 10, fontFamily: MONO_FONT, letterSpacing: "0.14em", textTransform: "uppercase" };
  const isCompact = typeof window !== "undefined" && window.innerWidth < 768;

  return (
    <form onSubmit={onSubmit} style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: isCompact ? "1fr" : "1.2fr 1fr", gap: 12 }}>
        <AuthField label="Email" type="email" value={form.email} onChange={(value) => setForm((current) => ({ ...current, email: value }))} placeholder="you@company.com" />
        <label style={labelStyle}>
          <span style={helperStyle}>Interested Tier</span>
          <select
            value={form.interestTier}
            onChange={(event) => setForm((current) => ({ ...current, interestTier: event.target.value }))}
            style={{ background: "rgba(2, 8, 23, 0.72)", border: "1px solid rgba(51,65,85,0.95)", color: "#e2e8f0", borderRadius: 12, padding: "12px 14px", fontSize: 14 }}
          >
            {WAITLIST_TIER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: isCompact ? "1fr" : "1fr 1fr", gap: 12 }}>
        <label style={labelStyle}>
          <span style={helperStyle}>Region of Interest</span>
          <select
            value={form.requestedRegion}
            onChange={(event) => setForm((current) => ({ ...current, requestedRegion: event.target.value }))}
            style={{ background: "rgba(2, 8, 23, 0.72)", border: "1px solid rgba(51,65,85,0.95)", color: "#e2e8f0", borderRadius: 12, padding: "12px 14px", fontSize: 14 }}
          >
            {REPORT_INPUT_OPTIONS.regions.map((region) => <option key={region} value={region}>{region}</option>)}
          </select>
        </label>
        <label style={labelStyle}>
          <span style={helperStyle}>Focus Area</span>
          <select
            value={form.focusArea}
            onChange={(event) => setForm((current) => ({ ...current, focusArea: event.target.value }))}
            style={{ background: "rgba(2, 8, 23, 0.72)", border: "1px solid rgba(51,65,85,0.95)", color: "#e2e8f0", borderRadius: 12, padding: "12px 14px", fontSize: 14 }}
          >
            {WAITLIST_FOCUS_OPTIONS.map((focus) => <option key={focus} value={focus}>{focus}</option>)}
          </select>
        </label>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: isCompact ? "1fr" : "1fr 1fr", gap: 12 }}>
        <AuthField label="Intended Use Case" value={form.intendedUseCase} onChange={(value) => setForm((current) => ({ ...current, intendedUseCase: value }))} placeholder="Board briefings, investing, security planning..." />
        <AuthField label="LinkedIn Profile (Optional)" value={form.linkedinProfile} onChange={(value) => setForm((current) => ({ ...current, linkedinProfile: value }))} placeholder="https://linkedin.com/in/..." />
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        <span style={helperStyle}>Additional Context</span>
        <textarea
          value={form.note}
          onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))}
          placeholder="Tell us which regions, sectors, or strategic questions matter most to you."
          rows={4}
          style={{
            background: "rgba(2, 8, 23, 0.72)",
            border: "1px solid rgba(51,65,85,0.95)",
            color: "#e2e8f0",
            borderRadius: 12,
            padding: "12px 14px",
            fontSize: 14,
            resize: "vertical",
          }}
        />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <button type="submit" style={{ border: "1px solid rgba(125,211,252,0.28)", borderRadius: 999, background: "rgba(56,189,248,0.16)", color: "#f8fafc", padding: "11px 16px", cursor: "pointer", fontFamily: MONO_FONT, letterSpacing: isCompact ? "0.08em" : "0.12em", textTransform: "uppercase", width: isCompact ? "100%" : "auto" }}>
          Request Early Access
        </button>
        {status ? (
          <span style={{ color: status.type === "error" ? "#fda4af" : "#93c5fd", fontSize: 12, fontFamily: MONO_FONT }}>
            {status.message}
          </span>
        ) : null}
      </div>
    </form>
  );
}

function ReportBuilderPreview({ form, setForm, onGenerate, status }) {
  const selectStyle = {
    background: "rgba(2, 8, 23, 0.72)",
    border: "1px solid rgba(51,65,85,0.95)",
    color: "#e2e8f0",
    borderRadius: 12,
    padding: "12px 14px",
    fontSize: 14,
  };
  const labelStyle = { display: "grid", gap: 8 };
  const headerStyle = { color: "#94a3b8", fontSize: 10, fontFamily: MONO_FONT, letterSpacing: "0.14em", textTransform: "uppercase" };
  const isCompact = typeof window !== "undefined" && window.innerWidth < 768;

  return (
    <form onSubmit={onGenerate} style={{ display: "grid", gap: 18 }}>
      <div style={{ display: "grid", gridTemplateColumns: isCompact ? "1fr" : "repeat(3, minmax(0, 1fr))", gap: 14 }}>
        <label style={labelStyle}>
          <span style={headerStyle}>Region / Area of Interest</span>
          <select value={form.region} onChange={(event) => setForm((current) => ({ ...current, region: event.target.value }))} style={selectStyle}>
            {REPORT_INPUT_OPTIONS.regions.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        <label style={labelStyle}>
          <span style={headerStyle}>Focus Area</span>
          <select value={form.focusArea} onChange={(event) => setForm((current) => ({ ...current, focusArea: event.target.value }))} style={selectStyle}>
            {REPORT_INPUT_OPTIONS.focusAreas.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        <label style={labelStyle}>
          <span style={headerStyle}>Time Horizon</span>
          <select value={form.timeHorizon} onChange={(event) => setForm((current) => ({ ...current, timeHorizon: event.target.value }))} style={selectStyle}>
            {REPORT_INPUT_OPTIONS.timeHorizons.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        <label style={labelStyle}>
          <span style={headerStyle}>Audience</span>
          <select value={form.audienceType} onChange={(event) => setForm((current) => ({ ...current, audienceType: event.target.value }))} style={selectStyle}>
            {REPORT_INPUT_OPTIONS.audienceTypes.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        <label style={labelStyle}>
          <span style={headerStyle}>Risk Appetite</span>
          <select value={form.riskAppetite} onChange={(event) => setForm((current) => ({ ...current, riskAppetite: event.target.value }))} style={selectStyle}>
            {REPORT_INPUT_OPTIONS.riskAppetites.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <button type="submit" style={{ border: "1px solid rgba(125,211,252,0.28)", borderRadius: 999, background: "rgba(56,189,248,0.16)", color: "#f8fafc", padding: "11px 16px", cursor: "pointer", fontFamily: MONO_FONT, letterSpacing: isCompact ? "0.08em" : "0.12em", textTransform: "uppercase", width: isCompact ? "100%" : "auto" }}>
          Preview Report Output
        </button>
        <PremiumBadge tone="warning">{REPORT_STATUS_BADGE}</PremiumBadge>
        {status ? (
          <span style={{ color: status.type === "error" ? "#fda4af" : "#93c5fd", fontSize: 12, fontFamily: MONO_FONT }}>
            {status.message}
          </span>
        ) : null}
      </div>
    </form>
  );
}

function HistoryList({ reports }) {
  if (reports.length === 0) {
    return <div style={{ color: "#94a3b8", lineHeight: 1.7 }}>Your premium report history will appear here once preview generations are saved.</div>;
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {reports.map((report) => (
        <div key={report.id} style={{ border: "1px solid rgba(51,65,85,0.9)", background: "rgba(6,12,24,0.9)", borderRadius: 16, padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
            <div style={{ color: "#f8fafc", fontWeight: 700 }}>{report.title}</div>
            <PremiumBadge>{report.status}</PremiumBadge>
          </div>
          <div style={{ color: "#94a3b8", fontSize: 13, lineHeight: 1.6 }}>
            {new Date(report.created_at).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })} · {report.region} · {report.focus_area}
          </div>
        </div>
      ))}
    </div>
  );
}

function WaitlistAdminPanel({ entries, status, onLoad }) {
  return (
    <ShellCard title="Waitlist Admin View" eyebrow="Protected access">
      <div style={{ color: "#cbd5e1", lineHeight: 1.8, marginBottom: 16 }}>
        Load waitlist entries with <code>ADMIN_SECRET</code>. This gives you a manual contact queue until mailing list sync is ready.
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
        <button
          onClick={onLoad}
          style={{
            border: "1px solid rgba(125,211,252,0.28)",
            borderRadius: 999,
            background: "rgba(56,189,248,0.16)",
            color: "#f8fafc",
            padding: "11px 16px",
            cursor: "pointer",
            fontFamily: "monospace",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          Load Waitlist
        </button>
        {status ? (
          <span style={{ color: status.type === "error" ? "#fda4af" : "#93c5fd", fontSize: 12, fontFamily: "monospace" }}>
            {status.message}
          </span>
        ) : null}
      </div>

      {entries.length === 0 ? (
        <div style={{ color: "#94a3b8", lineHeight: 1.7 }}>
          No entries loaded yet.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12, maxHeight: 420, overflowY: "auto", paddingRight: 4 }}>
          {entries.map((entry, index) => (
            <div key={`${entry.email}-${entry.created_at}-${index}`} style={{ border: "1px solid rgba(51,65,85,0.9)", background: "rgba(6,12,24,0.9)", borderRadius: 16, padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 8, flexWrap: "wrap" }}>
                <div style={{ color: "#f8fafc", fontWeight: 700 }}>{entry.email}</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <PremiumBadge>{entry.interest_tier}</PremiumBadge>
                  <PremiumBadge tone="success">{entry.requested_region}</PremiumBadge>
                </div>
              </div>
              <div style={{ color: "#94a3b8", fontSize: 13, lineHeight: 1.6 }}>
                {new Date(entry.created_at).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
              </div>
              {entry.note ? (
                <div style={{ color: "#cbd5e1", lineHeight: 1.7, marginTop: 10, whiteSpace: "pre-wrap" }}>
                  {entry.note}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </ShellCard>
  );
}

function AuthPanel({ configured, session, authMode, setAuthMode, authForm, setAuthForm, onAuth, onLogout, authMessage }) {
  if (!configured) {
    return (
      <ShellCard title="Premium Access Coming Soon" eyebrow="Private preview">
        <div style={{ color: "#cbd5e1", lineHeight: 1.8, marginBottom: 16 }}>
          Personalized Reports are currently in private preview. Join the early-access list to help shape the first rollout.
        </div>
        <div style={{ color: "#94a3b8", lineHeight: 1.75 }}>
          We’re opening access carefully for operators, analysts, and strategic users who want tailored geopolitical briefings built on Grigori’s live intelligence engine.
        </div>
      </ShellCard>
    );
  }

  if (session?.user) {
    return (
      <ShellCard title={session.user.email || "Premium Preview Access"} eyebrow="Signed in">
        <div style={{ color: "#cbd5e1", lineHeight: 1.8, marginBottom: 18 }}>
          Your premium workspace is available in preview mode. Subscription checkout and portal access will be activated in a later phase.
        </div>
        <button onClick={onLogout} style={{ border: "1px solid rgba(125,211,252,0.28)", borderRadius: 999, background: "rgba(15,23,42,0.82)", color: "#f8fafc", padding: "11px 16px", cursor: "pointer", fontFamily: "monospace", letterSpacing: "0.08em", textTransform: "uppercase" }}>
          Logout
        </button>
      </ShellCard>
    );
  }

  return (
    <ShellCard title="Access Personalized Reports" eyebrow="Premium preview">
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
        {[
          { key: "login", label: "Sign In" },
          { key: "signup", label: "Sign Up" },
          { key: "reset", label: "Reset Password" },
        ].map((mode) => (
          <button
            key={mode.key}
            onClick={() => setAuthMode(mode.key)}
            style={{
              border: "1px solid rgba(125,211,252,0.22)",
              borderRadius: 999,
              background: authMode === mode.key ? "rgba(56,189,248,0.16)" : "rgba(15,23,42,0.82)",
              color: "#f8fafc",
              padding: "9px 14px",
              cursor: "pointer",
              fontFamily: "monospace",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            {mode.label}
          </button>
        ))}
      </div>
      <div style={{ display: "grid", gap: 14 }}>
        <AuthField label="Email" type="email" value={authForm.email} onChange={(value) => setAuthForm((current) => ({ ...current, email: value }))} placeholder="you@company.com" />
        {authMode !== "reset" ? (
          <AuthField label="Password" type="password" value={authForm.password} onChange={(value) => setAuthForm((current) => ({ ...current, password: value }))} placeholder="Secure password" />
        ) : null}
        <button onClick={onAuth} style={{ border: "1px solid rgba(125,211,252,0.28)", borderRadius: 999, background: "rgba(56,189,248,0.16)", color: "#f8fafc", padding: "11px 16px", cursor: "pointer", fontFamily: "monospace", letterSpacing: "0.08em", textTransform: "uppercase" }}>
          {authMode === "signup" ? "Create Account" : authMode === "reset" ? "Send Reset Link" : "Sign In"}
        </button>
        {authMessage ? (
          <div style={{ color: authMessage.type === "error" ? "#fda4af" : "#93c5fd", fontSize: 12, fontFamily: "monospace" }}>
            {authMessage.message}
          </div>
        ) : null}
      </div>
    </ShellCard>
  );
}

export default function ReportsApp({ activeView = "reports", onNavigate }) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const authConfigured = Boolean(supabase);
  const [viewportWidth, setViewportWidth] = useState(() => (typeof window === "undefined" ? 1280 : window.innerWidth));
  const [session, setSession] = useState(null);
  const [authMode, setAuthMode] = useState("login");
  const [authForm, setAuthForm] = useState({ email: "", password: "" });
  const [authMessage, setAuthMessage] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyState, setHistoryState] = useState({ status: "idle", message: "" });
  const [waitlistForm, setWaitlistForm] = useState({
    email: "",
    interestTier: "confidential",
    requestedRegion: "Global",
    focusArea: "General Geopolitics",
    intendedUseCase: "",
    linkedinProfile: "",
    note: "",
  });
  const [waitlistStatus, setWaitlistStatus] = useState(null);
  const [waitlistEntries, setWaitlistEntries] = useState([]);
  const [adminWaitlistStatus, setAdminWaitlistStatus] = useState(null);
  const [showAdminWaitlist, setShowAdminWaitlist] = useState(false);
  const [previewStatus, setPreviewStatus] = useState(null);
  const [reportForm, setReportForm] = useState({
    region: REPORT_INPUT_OPTIONS.regions[0],
    focusArea: REPORT_INPUT_OPTIONS.focusAreas[0],
    timeHorizon: REPORT_INPUT_OPTIONS.timeHorizons[0],
    audienceType: REPORT_INPUT_OPTIONS.audienceTypes[0],
    riskAppetite: REPORT_INPUT_OPTIONS.riskAppetites[1],
  });

  const loadPremiumData = useCallback(async (activeSession) => {
    const accessToken = activeSession?.access_token || null;
    const [statusData, historyData] = await Promise.all([
      authedFetch("/api/v1/subscription/status", accessToken),
      activeSession ? authedFetch("/api/v1/reports/history", accessToken) : Promise.resolve({ reports: [] }),
    ]);
    setSubscription(statusData);
    setHistory(historyData.reports ?? []);
  }, []);

  useEffect(() => {
    document.title = `${BRAND.pageTitle} | Personalized Reports`;
  }, []);

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!supabase) return undefined;

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
      loadPremiumData(data.session ?? null).catch(() => {});
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession ?? null);
      loadPremiumData(nextSession ?? null).catch(() => {});
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, [supabase, loadPremiumData]);

  useEffect(() => {
    if (supabase) return;
    loadPremiumData(null).catch(() => {});
  }, [supabase, loadPremiumData]);

  const handleAuth = useCallback(async () => {
    if (!supabase) return;
    setAuthMessage(null);
    try {
      if (authMode === "signup") {
        const { error } = await supabase.auth.signUp({
          email: authForm.email,
          password: authForm.password,
        });
        if (error) throw error;
        setAuthMessage({ type: "success", message: "Account created. Check your inbox if email confirmation is enabled." });
      } else if (authMode === "reset") {
        const { error } = await supabase.auth.resetPasswordForEmail(authForm.email, {
          redirectTo: typeof window !== "undefined" ? `${window.location.origin}/reports` : undefined,
        });
        if (error) throw error;
        setAuthMessage({ type: "success", message: "Password reset email sent." });
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: authForm.email,
          password: authForm.password,
        });
        if (error) throw error;
        setAuthMessage({ type: "success", message: "Signed in successfully." });
      }
    } catch (error) {
      setAuthMessage({ type: "error", message: error.message || "Authentication failed." });
    }
  }, [supabase, authForm, authMode]);

  const handleLogout = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setHistory([]);
    setSubscription(null);
  }, [supabase]);

  const handleWaitlist = useCallback(async (event) => {
    event.preventDefault();
    setWaitlistStatus(null);
    try {
      const data = await authedFetch("/api/v1/reports/waitlist", null, {
        method: "POST",
        body: JSON.stringify(waitlistForm),
      });
      setWaitlistStatus({ type: "success", message: data.message || "Waitlist saved." });
      setWaitlistForm((current) => ({
        ...current,
        email: "",
        intendedUseCase: "",
        linkedinProfile: "",
        note: "",
      }));
    } catch (error) {
      setWaitlistStatus({ type: "error", message: "We couldn't save your request just now. Please try again shortly." });
    }
  }, [waitlistForm]);

  const handleLoadWaitlist = useCallback(async () => {
    const secret = window.prompt("Enter ADMIN_SECRET to load waitlist entries.");
    if (!secret) return;

    setAdminWaitlistStatus({ type: "info", message: "Loading waitlist..." });
    try {
      const data = await authedFetch("/api/v1/reports/waitlist?limit=200", null, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${secret}`,
        },
      });
      setWaitlistEntries(data.entries ?? []);
      setAdminWaitlistStatus({ type: "success", message: `Loaded ${data.total ?? (data.entries ?? []).length} waitlist entries.` });
    } catch (error) {
      setAdminWaitlistStatus({ type: "error", message: error.message || "Unable to load waitlist entries." });
    }
  }, []);

  const handlePreviewGenerate = useCallback(async (event) => {
    event.preventDefault();
    setPreviewStatus(null);
    setHistoryState({ status: "running", message: "Preparing premium preview..." });
    try {
      if (!session?.access_token) {
        throw new Error("Sign in to preview the report workflow.");
      }
      const data = await authedFetch("/api/v1/reports/generate", session.access_token, {
        method: "POST",
        body: JSON.stringify(reportForm),
      });
      setPreviewStatus({ type: "success", message: data.message });
      setHistoryState({ status: "ready", message: "" });
      await loadPremiumData(session);
    } catch (error) {
      setPreviewStatus({ type: "error", message: error.message || "Preview generation failed." });
      setHistoryState({ status: "error", message: error.message || "Preview generation failed." });
    }
  }, [loadPremiumData, reportForm, session]);

  const usage = subscription?.usage;
  const isMobile = viewportWidth < 768;
  const isTablet = viewportWidth >= 768 && viewportWidth <= 1024;
  const shellPaddingX = isMobile ? 14 : isTablet ? 18 : 24;
  const shellTopPadding = isMobile ? 136 : isTablet ? 124 : 112;
  const headerPadding = isMobile ? "14px 14px 12px" : isTablet ? "16px 18px 14px" : "16px 24px 14px";
  const heroGrid = isMobile ? "1fr" : "1.1fr 0.9fr";
  const planGrid = isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))";
  const historyGrid = isMobile ? "1fr" : "1.15fr 0.85fr";
  const previewUsageGrid = isMobile ? "1fr" : "1fr 1fr";

  return (
    <div style={{
      minHeight: "100vh",
      background: "radial-gradient(circle at top, rgba(125, 211, 252, 0.05), transparent 26%), linear-gradient(180deg, #020817 0%, #061120 100%)",
      color: "#e2e8f0",
      padding: `${shellTopPadding}px ${shellPaddingX}px calc(env(safe-area-inset-bottom, 0px) + 72px)`,
      fontFamily: BODY_FONT,
      overflowX: "hidden",
    }}>
      <div style={{ maxWidth: 1320, margin: "0 auto", display: "grid", gap: 26 }}>
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 100,
          background: "linear-gradient(180deg, rgba(4,9,18,0.95) 0%, rgba(4,10,22,0.88) 100%)",
          backdropFilter: "blur(18px)",
          borderBottom: "1px solid rgba(87, 216, 255, 0.12)",
          padding: `${isMobile ? "calc(env(safe-area-inset-top, 0px) + 12px)" : "16px"} ${shellPaddingX}px 14px`,
          display: "flex",
          justifyContent: "space-between",
          alignItems: isMobile ? "stretch" : "center",
          gap: 16,
          flexWrap: "wrap",
        }}>
          <div>
            <div style={{ color: "#f8fafc", fontFamily: DISPLAY_FONT, fontSize: isMobile ? 22 : 30, fontWeight: 700, letterSpacing: isMobile ? "0.12em" : "0.16em", textTransform: "uppercase", lineHeight: 1 }}>
              Grigori
            </div>
            <div style={{ color: "rgba(191,219,254,0.78)", fontFamily: BODY_FONT, fontSize: isMobile ? 12 : 13, letterSpacing: "0.06em", marginTop: 4 }}>
              by oryth.io
            </div>
            <div style={{ color: "#70d7f2", fontFamily: MONO_FONT, fontSize: isMobile ? 10 : 11, letterSpacing: isMobile ? "0.12em" : "0.16em", textTransform: "uppercase", marginTop: 8 }}>
              Strategic Intelligence Dashboard
            </div>
          </div>
          <div style={{ display: "grid", gap: 12, justifyItems: isMobile ? "stretch" : "end", width: isMobile ? "100%" : "auto" }}>
            <HeaderNav activeView={activeView} onNavigate={onNavigate} />
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: isMobile ? "flex-start" : "flex-end" }}>
              <PremiumBadge tone="warning">Work in Progress</PremiumBadge>
              <PremiumBadge>Public Preview</PremiumBadge>
              <PremiumBadge tone="success">Operational</PremiumBadge>
            </div>
          </div>
        </div>

        <ShellCard title="Intelligence Tailored To Your Priorities" eyebrow={`${BRAND.fullName} · ${BRAND.subtitle}`} accent="rgba(125, 211, 252, 0.32)">
          <div style={{ display: "flex", justifyContent: "space-between", gap: isMobile ? 16 : 20, flexWrap: "wrap", alignItems: "flex-start" }}>
            <div style={{ maxWidth: 760 }}>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
                <PremiumBadge tone="warning">{REPORT_STATUS_BADGE}</PremiumBadge>
                <PremiumBadge>Personalized Reports</PremiumBadge>
              </div>
              <p style={{ color: "#cbd5e1", lineHeight: 1.8, fontSize: isMobile ? 15 : 16, margin: 0, fontFamily: BODY_FONT }}>
                Receive executive-grade geopolitical and strategic risk reports generated from Grigori’s live intelligence engine.
              </p>
              <p style={{ color: "#94a3b8", lineHeight: 1.8, fontSize: isMobile ? 14 : 15, marginTop: 12, fontFamily: BODY_FONT }}>
                {REPORTS_WIP_COPY}
              </p>
            </div>
            <div style={{ display: "grid", gap: 10, width: isMobile ? "100%" : "auto", minWidth: isMobile ? 0 : 260 }}>
              <button style={{ border: "1px solid rgba(125,211,252,0.28)", borderRadius: 999, background: "rgba(56,189,248,0.16)", color: "#f8fafc", padding: "11px 16px", cursor: "pointer", fontFamily: MONO_FONT, textTransform: "uppercase", letterSpacing: isMobile ? "0.08em" : "0.12em", width: "100%" }}>
                Upgrade to Confidential
              </button>
              <button style={{ border: "1px solid rgba(196,181,253,0.28)", borderRadius: 999, background: "rgba(76,29,149,0.16)", color: "#f8fafc", padding: "11px 16px", cursor: "pointer", fontFamily: MONO_FONT, textTransform: "uppercase", letterSpacing: isMobile ? "0.08em" : "0.12em", width: "100%" }}>
                Upgrade to Top Secret
              </button>
              <button onClick={() => setAuthMode(authConfigured ? "login" : "signup")} style={{ border: "1px solid rgba(71,85,105,0.82)", borderRadius: 999, background: "rgba(15,23,42,0.82)", color: "#f8fafc", padding: "11px 16px", cursor: "pointer", fontFamily: MONO_FONT, textTransform: "uppercase", letterSpacing: isMobile ? "0.08em" : "0.12em", width: "100%" }}>
                {authConfigured ? "Sign In" : "Join Early Access"}
              </button>
            </div>
          </div>
        </ShellCard>

        <div style={{ display: "grid", gridTemplateColumns: heroGrid, gap: 22 }}>
          <AuthPanel
            configured={authConfigured}
            session={session}
            authMode={authMode}
            setAuthMode={setAuthMode}
            authForm={authForm}
            setAuthForm={setAuthForm}
            onAuth={handleAuth}
            onLogout={handleLogout}
            authMessage={authMessage}
          />

          <ShellCard title="Early Access Waitlist" eyebrow="Stay in the loop">
            <div style={{ color: "#cbd5e1", lineHeight: 1.8, marginBottom: 18 }}>
              Share your focus area, region of interest, and intended use case. We’ll use this to shape the early-access rollout for Grigori Reports.
            </div>
            <InterestForm form={waitlistForm} setForm={setWaitlistForm} onSubmit={handleWaitlist} status={waitlistStatus} />
          </ShellCard>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: planGrid, gap: 18 }}>
          {PREMIUM_PLANS.map((plan, index) => (
            <PlanCard key={plan.tier} plan={plan} emphasized={index === 1} actionLabel={plan.tier === "top_secret" ? "Priority Access" : "Request Access"} />
          ))}
        </div>

        <ShellCard title="Premium Report Generator Preview" eyebrow="Upcoming workflow">
          <div style={{ color: "#cbd5e1", lineHeight: 1.8, marginBottom: 18 }}>
            The full report engine will synthesize live events, historical storage, scenario drift, transport context, and market logic into a concise strategic briefing.
          </div>
          <ReportBuilderPreview form={reportForm} setForm={setReportForm} onGenerate={handlePreviewGenerate} status={previewStatus} />
          <div style={{ display: "grid", gridTemplateColumns: previewUsageGrid, gap: 18, marginTop: 24 }}>
            <div>
              <div style={{ color: "#7dd3fc", fontSize: 11, fontFamily: "monospace", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 10 }}>
                Planned Output Sections
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                {REPORT_OUTPUT_SECTIONS.map((section) => (
                  <div key={section} style={{ color: "#cbd5e1", lineHeight: 1.6 }}>• {section}</div>
                ))}
              </div>
            </div>
            <div style={{ border: "1px solid rgba(51,65,85,0.9)", background: "rgba(4,10,22,0.9)", borderRadius: 18, padding: 18 }}>
              <div style={{ color: "#7dd3fc", fontSize: 11, fontFamily: "monospace", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 10 }}>
                Usage Preview
              </div>
              <div style={{ display: "grid", gap: 10 }}>
                <div style={{ color: "#f8fafc", fontSize: 18, fontWeight: 700 }}>
                  {usage?.tierName || "Free Access"}
                </div>
                <div style={{ color: "#94a3b8", lineHeight: 1.7 }}>
                  {usage ? `${usage.reportsUsedToday} used today · ${usage.remainingToday} remaining` : "Sign in to preview usage limits and future subscription state."}
                </div>
                <PremiumBadge>{REPORT_STATUS_BADGE}</PremiumBadge>
              </div>
            </div>
          </div>
        </ShellCard>

        <div style={{ display: "grid", gridTemplateColumns: historyGrid, gap: 22 }}>
          <ShellCard title="Report History Preview" eyebrow="Saved drafts and generated briefs">
            {historyState.message ? (
              <div style={{ color: historyState.status === "error" ? "#fda4af" : "#93c5fd", fontFamily: "monospace", fontSize: 12, marginBottom: 12 }}>
                {historyState.message}
              </div>
            ) : null}
            <HistoryList reports={history} />
          </ShellCard>

          <ShellCard title="Watchlists & PDF Export" eyebrow="Planned premium capabilities">
            <div style={{ color: "#cbd5e1", lineHeight: 1.8, marginBottom: 18 }}>
              Personalized Reports will inherit saved watchlists, preserve report history, compare previous assessments, and export branded PDF briefings.
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              {[
                "Watchlist A · Taiwan · TSMC · South China Sea",
                "Watchlist B · Hormuz · Oil · Tankers",
                "Watchlist C · Balkans · Elections · Energy grid",
              ].map((item) => (
                <div key={item} style={{ border: "1px solid rgba(51,65,85,0.9)", background: "rgba(4,10,22,0.9)", borderRadius: 14, padding: 14, color: "#e2e8f0" }}>
                  {item}
                </div>
              ))}
            </div>
          </ShellCard>
        </div>

        <div style={{ display: "grid", gap: 12, justifyItems: "start" }}>
          <button
            onClick={() => setShowAdminWaitlist((current) => !current)}
            style={{
              border: "1px solid rgba(71,85,105,0.82)",
              borderRadius: 999,
              background: "rgba(15,23,42,0.82)",
              color: "#cbd5e1",
              padding: "10px 14px",
              cursor: "pointer",
              fontFamily: MONO_FONT,
              textTransform: "uppercase",
              letterSpacing: "0.12em",
              fontSize: 10,
            }}
          >
            {showAdminWaitlist ? "Hide Admin Waitlist" : "Admin Waitlist Tools"}
          </button>
          {showAdminWaitlist ? (
            <WaitlistAdminPanel
              entries={waitlistEntries}
              status={adminWaitlistStatus}
              onLoad={handleLoadWaitlist}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

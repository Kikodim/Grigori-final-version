import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { BRAND, PREMIUM_PLANS, REPORT_INPUT_OPTIONS, REPORT_OUTPUT_SECTIONS, REPORT_STATUS_BADGE, REPORTS_WIP_COPY } from "../premium-config.js";

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
      borderRadius: 22,
      padding: 24,
      boxShadow: "0 24px 70px rgba(0,0,0,0.32)",
    }}>
      {eyebrow ? (
        <div style={{ color: "#7dd3fc", fontSize: 11, fontFamily: "monospace", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 10 }}>
          {eyebrow}
        </div>
      ) : null}
      <div style={{ color: "#f8fafc", fontSize: 24, fontWeight: 700, lineHeight: 1.2, marginBottom: 14, fontFamily: "'Space Mono', monospace" }}>
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
      fontFamily: "monospace",
      fontSize: 11,
      letterSpacing: "0.1em",
      textTransform: "uppercase",
      whiteSpace: "nowrap",
    }}>
      {children}
    </span>
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
      <span style={{ color: "#94a3b8", fontSize: 11, fontFamily: "monospace", letterSpacing: "0.1em", textTransform: "uppercase" }}>{label}</span>
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
  return (
    <form onSubmit={onSubmit} style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 12 }}>
        <AuthField label="Email" type="email" value={form.email} onChange={(value) => setForm((current) => ({ ...current, email: value }))} placeholder="you@company.com" />
        <label style={{ display: "grid", gap: 8 }}>
          <span style={{ color: "#94a3b8", fontSize: 11, fontFamily: "monospace", letterSpacing: "0.1em", textTransform: "uppercase" }}>Interest Tier</span>
          <select
            value={form.interestTier}
            onChange={(event) => setForm((current) => ({ ...current, interestTier: event.target.value }))}
            style={{ background: "rgba(2, 8, 23, 0.72)", border: "1px solid rgba(51,65,85,0.95)", color: "#e2e8f0", borderRadius: 12, padding: "12px 14px", fontSize: 14 }}
          >
            <option value="confidential">Confidential</option>
            <option value="top_secret">Top Secret</option>
          </select>
        </label>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <label style={{ display: "grid", gap: 8 }}>
          <span style={{ color: "#94a3b8", fontSize: 11, fontFamily: "monospace", letterSpacing: "0.1em", textTransform: "uppercase" }}>Priority Region</span>
          <select
            value={form.requestedRegion}
            onChange={(event) => setForm((current) => ({ ...current, requestedRegion: event.target.value }))}
            style={{ background: "rgba(2, 8, 23, 0.72)", border: "1px solid rgba(51,65,85,0.95)", color: "#e2e8f0", borderRadius: 12, padding: "12px 14px", fontSize: 14 }}
          >
            {REPORT_INPUT_OPTIONS.regions.map((region) => <option key={region} value={region}>{region}</option>)}
          </select>
        </label>
        <AuthField label="Notes" value={form.note} onChange={(value) => setForm((current) => ({ ...current, note: value }))} placeholder="Audience, industry, or region focus" />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <button type="submit" style={{ border: "1px solid rgba(125,211,252,0.28)", borderRadius: 999, background: "rgba(56,189,248,0.16)", color: "#f8fafc", padding: "11px 16px", cursor: "pointer", fontFamily: "monospace", letterSpacing: "0.08em", textTransform: "uppercase" }}>
          Join Waitlist
        </button>
        {status ? (
          <span style={{ color: status.type === "error" ? "#fda4af" : "#93c5fd", fontSize: 12, fontFamily: "monospace" }}>
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
  const headerStyle = { color: "#94a3b8", fontSize: 11, fontFamily: "monospace", letterSpacing: "0.1em", textTransform: "uppercase" };

  return (
    <form onSubmit={onGenerate} style={{ display: "grid", gap: 18 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 14 }}>
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
        <button type="submit" style={{ border: "1px solid rgba(125,211,252,0.28)", borderRadius: 999, background: "rgba(56,189,248,0.16)", color: "#f8fafc", padding: "11px 16px", cursor: "pointer", fontFamily: "monospace", letterSpacing: "0.08em", textTransform: "uppercase" }}>
          Preview Report Output
        </button>
        <PremiumBadge tone="warning">{REPORT_STATUS_BADGE}</PremiumBadge>
        {status ? (
          <span style={{ color: status.type === "error" ? "#fda4af" : "#93c5fd", fontSize: 12, fontFamily: "monospace" }}>
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

function AuthPanel({ configured, session, authMode, setAuthMode, authForm, setAuthForm, onAuth, onLogout, authMessage }) {
  if (!configured) {
    return (
      <ShellCard title="Supabase Auth Not Configured" eyebrow="Premium access">
        <div style={{ color: "#cbd5e1", lineHeight: 1.8 }}>
          Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to enable sign-up, sign-in, and session persistence for Personalized Reports.
        </div>
      </ShellCard>
    );
  }

  if (session?.user) {
    return (
      <ShellCard title={session.user.email || "Authenticated"} eyebrow="Signed in">
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
    <ShellCard title="Sign In To Premium Preview" eyebrow="Account access">
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
        {["login", "signup", "reset"].map((mode) => (
          <button
            key={mode}
            onClick={() => setAuthMode(mode)}
            style={{
              border: "1px solid rgba(125,211,252,0.22)",
              borderRadius: 999,
              background: authMode === mode ? "rgba(56,189,248,0.16)" : "rgba(15,23,42,0.82)",
              color: "#f8fafc",
              padding: "9px 14px",
              cursor: "pointer",
              fontFamily: "monospace",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            {mode}
          </button>
        ))}
      </div>
      <div style={{ display: "grid", gap: 14 }}>
        <AuthField label="Email" type="email" value={authForm.email} onChange={(value) => setAuthForm((current) => ({ ...current, email: value }))} placeholder="you@company.com" />
        {authMode !== "reset" ? (
          <AuthField label="Password" type="password" value={authForm.password} onChange={(value) => setAuthForm((current) => ({ ...current, password: value }))} placeholder="Secure password" />
        ) : null}
        <button onClick={onAuth} style={{ border: "1px solid rgba(125,211,252,0.28)", borderRadius: 999, background: "rgba(56,189,248,0.16)", color: "#f8fafc", padding: "11px 16px", cursor: "pointer", fontFamily: "monospace", letterSpacing: "0.08em", textTransform: "uppercase" }}>
          {authMode === "signup" ? "Create Account" : authMode === "reset" ? "Send Reset Link" : "Login"}
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

export default function ReportsApp() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [session, setSession] = useState(null);
  const [authMode, setAuthMode] = useState("login");
  const [authForm, setAuthForm] = useState({ email: "", password: "" });
  const [authMessage, setAuthMessage] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyState, setHistoryState] = useState({ status: "idle", message: "" });
  const [waitlistForm, setWaitlistForm] = useState({ email: "", interestTier: "confidential", requestedRegion: "Global", note: "" });
  const [waitlistStatus, setWaitlistStatus] = useState(null);
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
    } catch (error) {
      setWaitlistStatus({ type: "error", message: error.message || "Unable to save waitlist interest." });
    }
  }, [waitlistForm]);

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

  return (
    <div style={{
      minHeight: "100vh",
      background: "radial-gradient(circle at top, rgba(125, 211, 252, 0.05), transparent 26%), linear-gradient(180deg, #020817 0%, #061120 100%)",
      color: "#e2e8f0",
      padding: "96px 24px 48px",
    }}>
      <div style={{ maxWidth: 1320, margin: "0 auto", display: "grid", gap: 26 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
          <div>
            <div style={{ color: "#f8fafc", fontFamily: "'Space Mono', monospace", fontSize: 30, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase" }}>
              Grigori
            </div>
            <div style={{ color: "rgba(191,219,254,0.72)", fontFamily: "Georgia, serif", fontSize: 14, letterSpacing: "0.08em" }}>
              by oryth.io
            </div>
          </div>
          <PremiumBadge>{BRAND.subtitle}</PremiumBadge>
        </div>

        <ShellCard title="Intelligence Tailored To Your Priorities" eyebrow={`${BRAND.fullName} · ${BRAND.subtitle}`} accent="rgba(125, 211, 252, 0.32)">
          <div style={{ display: "flex", justifyContent: "space-between", gap: 20, flexWrap: "wrap", alignItems: "flex-start" }}>
            <div style={{ maxWidth: 760 }}>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
                <PremiumBadge tone="warning">{REPORT_STATUS_BADGE}</PremiumBadge>
                <PremiumBadge>Personalized Reports</PremiumBadge>
              </div>
              <p style={{ color: "#cbd5e1", lineHeight: 1.8, fontSize: 16, margin: 0 }}>
                Receive executive-grade geopolitical and strategic risk reports generated from Grigori’s live intelligence engine.
              </p>
              <p style={{ color: "#94a3b8", lineHeight: 1.8, fontSize: 15, marginTop: 12 }}>
                {REPORTS_WIP_COPY}
              </p>
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              <button style={{ border: "1px solid rgba(125,211,252,0.28)", borderRadius: 999, background: "rgba(56,189,248,0.16)", color: "#f8fafc", padding: "11px 16px", cursor: "pointer", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Upgrade to Confidential
              </button>
              <button style={{ border: "1px solid rgba(196,181,253,0.28)", borderRadius: 999, background: "rgba(76,29,149,0.16)", color: "#f8fafc", padding: "11px 16px", cursor: "pointer", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Upgrade to Top Secret
              </button>
              <button onClick={() => setAuthMode("login")} style={{ border: "1px solid rgba(71,85,105,0.82)", borderRadius: 999, background: "rgba(15,23,42,0.82)", color: "#f8fafc", padding: "11px 16px", cursor: "pointer", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Sign In
              </button>
            </div>
          </div>
        </ShellCard>

        <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 22 }}>
          <AuthPanel
            configured={Boolean(supabase)}
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
              Share your priority region and preferred tier. We’ll use this to shape the launch order for premium reporting.
            </div>
            <InterestForm form={waitlistForm} setForm={setWaitlistForm} onSubmit={handleWaitlist} status={waitlistStatus} />
          </ShellCard>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 18 }}>
          {PREMIUM_PLANS.map((plan, index) => (
            <PlanCard key={plan.tier} plan={plan} emphasized={index === 1} actionLabel={plan.tier === "top_secret" ? "Priority Access" : "Request Access"} />
          ))}
        </div>

        <ShellCard title="Premium Report Generator Preview" eyebrow="Upcoming workflow">
          <div style={{ color: "#cbd5e1", lineHeight: 1.8, marginBottom: 18 }}>
            The full report engine will synthesize live events, historical storage, scenario drift, transport context, and market logic into a concise strategic briefing.
          </div>
          <ReportBuilderPreview form={reportForm} setForm={setReportForm} onGenerate={handlePreviewGenerate} status={previewStatus} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginTop: 24 }}>
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

        <div style={{ display: "grid", gridTemplateColumns: "1.15fr 0.85fr", gap: 22 }}>
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
      </div>
    </div>
  );
}

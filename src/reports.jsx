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
  { value: "analyst", label: "Analyst · €20/month" },
  { value: "strategic", label: "Strategic · €59/month" },
  { value: "not_sure", label: "Not sure yet" },
];
const BRAND_WORDMARK = "/assets/brand/grigori-wordmark.svg";
const BRAND_REPORT_LOCKUP = "/assets/brand/grigori-report-lockup.svg";

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
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error ?? `Request failed with ${res.status}`);
  }
  return data;
}

function ShellCard({ title, eyebrow, children, accent = "rgba(125, 211, 252, 0.24)", actions = null }) {
  return (
    <section style={{
      background: "linear-gradient(180deg, rgba(7,14,28,0.96) 0%, rgba(4,10,22,0.98) 100%)",
      border: `1px solid ${accent}`,
      borderRadius: 22,
      padding: 24,
      boxShadow: "0 24px 70px rgba(0,0,0,0.32)",
    }}>
      {eyebrow ? (
        <div style={{ color: "#7dd3fc", fontSize: 10, fontFamily: MONO_FONT, letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 10 }}>
          {eyebrow}
        </div>
      ) : null}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14, flexWrap: "wrap", marginBottom: 14 }}>
        <div style={{ color: "#f8fafc", fontSize: 24, fontWeight: 700, lineHeight: 1.15, fontFamily: DISPLAY_FONT, letterSpacing: "0.03em" }}>
          {title}
        </div>
        {actions}
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
      : tone === "danger"
        ? { color: "#fda4af", border: "rgba(253,164,175,0.3)", bg: "rgba(253,164,175,0.12)" }
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
        <div style={{ color: "#7dd3fc", fontSize: 11, fontFamily: MONO_FONT, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 10 }}>
          {plan.name}
        </div>
        <div style={{ color: "#f8fafc", fontSize: 28, fontFamily: MONO_FONT, fontWeight: 700 }}>
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
        fontFamily: MONO_FONT,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        cursor: "pointer",
      }}>
        {actionLabel}
      </button>
    </div>
  );
}

function SampleReportsSection({ isMobile = false }) {
  const samples = [
    {
      title: "Strait of Hormuz Situation Report",
      region: "Strait of Hormuz",
      focus: "Energy / Shipping",
      includes: "source confidence, tanker risk, oil context, escalation triggers",
    },
    {
      title: "Black Sea Security Brief",
      region: "Black Sea",
      focus: "Military / Shipping",
      includes: "port disruption watch, grain corridor exposure, NATO signaling",
    },
    {
      title: "Europe / Balkans Political Risk Snapshot",
      region: "Europe / Balkans",
      focus: "Political Risk",
      includes: "elections, protests, EU pressure, energy-security implications",
    },
  ];
  return (
    <ShellCard title="Preview Reports" eyebrow="Coming soon">
      <div style={{ color: "#cbd5e1", lineHeight: 1.8, marginBottom: 18 }}>
        Sample report formats show how paid briefings will package Grigori signals into structured, source-aware intelligence products.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))", gap: 14 }}>
        {samples.map((sample) => (
          <div key={sample.title} style={{ border: "1px solid rgba(51,65,85,0.9)", background: "rgba(4,10,22,0.9)", borderRadius: 18, padding: 16, display: "grid", gap: 10 }}>
            <PremiumBadge tone="info">Preview</PremiumBadge>
            <div style={{ color: "#f8fafc", fontSize: 17, fontFamily: DISPLAY_FONT, fontWeight: 700, lineHeight: 1.25 }}>{sample.title}</div>
            <div style={{ color: "#94a3b8", lineHeight: 1.6 }}>{sample.region} · {sample.focus}</div>
            <div style={{ color: "#cbd5e1", lineHeight: 1.65 }}>Includes {sample.includes}.</div>
          </div>
        ))}
      </div>
    </ShellCard>
  );
}

function FieldLabel({ children }) {
  return <span style={{ color: "#94a3b8", fontSize: 10, fontFamily: MONO_FONT, letterSpacing: "0.14em", textTransform: "uppercase" }}>{children}</span>;
}

function AuthField({ label, type = "text", value, onChange, placeholder }) {
  return (
    <label style={{ display: "grid", gap: 8 }}>
      <FieldLabel>{label}</FieldLabel>
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

function SelectField({ label, value, onChange, options }) {
  return (
    <label style={{ display: "grid", gap: 8 }}>
      <FieldLabel>{label}</FieldLabel>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={{
          background: "rgba(2, 8, 23, 0.72)",
          border: "1px solid rgba(51,65,85,0.95)",
          color: "#e2e8f0",
          borderRadius: 12,
          padding: "12px 14px",
          fontSize: 14,
        }}
      >
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function InterestForm({ form, setForm, onSubmit, status, compact = false }) {
  return (
    <form onSubmit={onSubmit} style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: compact ? "1fr" : "1.2fr 1fr", gap: 12 }}>
        <AuthField label="Email" type="email" value={form.email} onChange={(value) => setForm((current) => ({ ...current, email: value }))} placeholder="you@company.com" />
        <label style={{ display: "grid", gap: 8 }}>
          <FieldLabel>Interested Tier</FieldLabel>
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
      <div style={{ display: "grid", gridTemplateColumns: compact ? "1fr" : "1fr 1fr", gap: 12 }}>
        <SelectField
          label="Region of Interest"
          value={form.requestedRegion}
          onChange={(value) => setForm((current) => ({ ...current, requestedRegion: value }))}
          options={REPORT_INPUT_OPTIONS.regions}
        />
        <SelectField
          label="Focus Area"
          value={form.focusArea}
          onChange={(value) => setForm((current) => ({ ...current, focusArea: value }))}
          options={WAITLIST_FOCUS_OPTIONS}
        />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: compact ? "1fr" : "1fr 1fr", gap: 12 }}>
        <AuthField label="Intended Use Case" value={form.intendedUseCase} onChange={(value) => setForm((current) => ({ ...current, intendedUseCase: value }))} placeholder="Board briefings, investing, security" />
        <AuthField label="LinkedIn Profile (Optional)" value={form.linkedinProfile} onChange={(value) => setForm((current) => ({ ...current, linkedinProfile: value }))} placeholder="https://linkedin.com/in/..." />
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        <FieldLabel>Additional Context</FieldLabel>
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
        <button type="submit" style={{ border: "1px solid rgba(125,211,252,0.28)", borderRadius: 999, background: "rgba(56,189,248,0.16)", color: "#f8fafc", padding: "11px 16px", cursor: "pointer", fontFamily: MONO_FONT, letterSpacing: compact ? "0.08em" : "0.12em", textTransform: "uppercase", width: compact ? "100%" : "auto" }}>
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
        <button onClick={onLogout} style={{ border: "1px solid rgba(125,211,252,0.28)", borderRadius: 999, background: "rgba(15,23,42,0.82)", color: "#f8fafc", padding: "11px 16px", cursor: "pointer", fontFamily: MONO_FONT, letterSpacing: "0.08em", textTransform: "uppercase" }}>
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
              fontFamily: MONO_FONT,
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
        <button onClick={onAuth} style={{ border: "1px solid rgba(125,211,252,0.28)", borderRadius: 999, background: "rgba(56,189,248,0.16)", color: "#f8fafc", padding: "11px 16px", cursor: "pointer", fontFamily: MONO_FONT, letterSpacing: "0.08em", textTransform: "uppercase" }}>
          {authMode === "signup" ? "Create Account" : authMode === "reset" ? "Send Reset Link" : "Sign In"}
        </button>
        {authMessage ? (
          <div style={{ color: authMessage.type === "error" ? "#fda4af" : "#93c5fd", fontSize: 12, fontFamily: MONO_FONT }}>
            {authMessage.message}
          </div>
        ) : null}
      </div>
    </ShellCard>
  );
}

function ReportConfigForm({ form, setForm, onGenerate, generating, generationAllowed, statusMessage, isMobile }) {
  return (
    <form onSubmit={onGenerate} style={{ display: "grid", gap: 18 }}>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: 14 }}>
        <SelectField label="Region / Area of Interest" value={form.region} onChange={(value) => setForm((current) => ({ ...current, region: value }))} options={REPORT_INPUT_OPTIONS.regions} />
        <SelectField label="Focus Area" value={form.focusArea} onChange={(value) => setForm((current) => ({ ...current, focusArea: value }))} options={REPORT_INPUT_OPTIONS.focusAreas} />
        <SelectField label="Time Horizon" value={form.timeHorizon} onChange={(value) => setForm((current) => ({ ...current, timeHorizon: value }))} options={REPORT_INPUT_OPTIONS.timeHorizons} />
        <SelectField label="Audience Type" value={form.audienceType} onChange={(value) => setForm((current) => ({ ...current, audienceType: value }))} options={REPORT_INPUT_OPTIONS.audienceTypes} />
        <SelectField label="Risk Framing" value={form.riskFraming} onChange={(value) => setForm((current) => ({ ...current, riskFraming: value }))} options={REPORT_INPUT_OPTIONS.riskAppetites} />
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        <FieldLabel>Optional Custom Question</FieldLabel>
        <textarea
          value={form.customQuestion}
          onChange={(event) => setForm((current) => ({ ...current, customQuestion: event.target.value }))}
          placeholder="How could this affect oil prices and shipping risk over the next 7 days?"
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
        <button
          type="submit"
          disabled={!generationAllowed || generating}
          style={{
            border: "1px solid rgba(125,211,252,0.28)",
            borderRadius: 999,
            background: generationAllowed ? "rgba(56,189,248,0.16)" : "rgba(15,23,42,0.82)",
            color: generationAllowed ? "#f8fafc" : "rgba(226,232,240,0.58)",
            padding: "12px 18px",
            cursor: generationAllowed && !generating ? "pointer" : "not-allowed",
            fontFamily: MONO_FONT,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            width: isMobile ? "100%" : "auto",
          }}
        >
          {generating ? "Generating Brief…" : generationAllowed ? "Generate Test Report" : "Preview Report Generation"}
        </button>
        <PremiumBadge tone="warning">{REPORT_STATUS_BADGE}</PremiumBadge>
        {statusMessage ? (
          <span style={{ color: statusMessage.type === "error" ? "#fda4af" : "#93c5fd", fontSize: 12, fontFamily: MONO_FONT }}>
            {statusMessage.message}
          </span>
        ) : null}
      </div>
    </form>
  );
}

function UsageCard({ status, session, adminUnlocked, onAdminUnlock }) {
  const usage = status?.usage;
  const summary = status?.dataSummary;
  const canGenerate = status?.generationAllowed;
  const isPublicView = !session?.user && !adminUnlocked;
  const publicAgeLabel = (() => {
    const iso = summary?.latestSignalAt;
    if (!iso) return "Awaiting broader signal match";
    const diffMs = Date.now() - new Date(iso).getTime();
    const minutes = Math.max(0, Math.round(diffMs / 60000));
    if (minutes < 60) return `${minutes || 1} min ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.round(hours / 24);
    return `${days}d ago`;
  })();
  const aiProviderLabel = adminUnlocked ? "AI Provider · Gemini" : "Private Alpha";
  const latestSignalLabel = summary?.latestSignalAt
    ? (adminUnlocked ? (summary?.latestSignalFreshness ?? "Awaiting refresh") : publicAgeLabel)
    : (isPublicView ? "Awaiting broader signal match" : "Awaiting refresh");
  const newsLabel = adminUnlocked
    ? (summary?.newsFreshness ?? "Awaiting next refresh")
    : "Awaiting next scheduled refresh";
  const aiStatusLabel = adminUnlocked
    ? (summary?.aiFreshness ?? "AI Pending")
    : "Manual generation only";
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ border: "1px solid rgba(51,65,85,0.9)", background: "rgba(4,10,22,0.92)", borderRadius: 20, padding: 18, display: "grid", gap: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <PremiumBadge tone="info">{aiProviderLabel}</PremiumBadge>
          <PremiumBadge tone="warning">Private Preview</PremiumBadge>
        </div>
        <div>
          <div style={{ color: "#f8fafc", fontSize: 34, fontFamily: MONO_FONT, fontWeight: 700 }}>
            {usage?.remainingToday ?? 0}
          </div>
          <div style={{ color: "#94a3b8", fontSize: 13, lineHeight: 1.6 }}>
            Reports remaining today
          </div>
        </div>
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <span style={{ color: "#94a3b8" }}>Matching signals</span>
            <span style={{ color: "#f8fafc", fontWeight: 600 }}>{summary?.matchingSignals ?? 0}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <span style={{ color: "#94a3b8" }}>Latest signal</span>
            <span style={{ color: "#f8fafc", fontWeight: 600 }}>{adminUnlocked ? latestSignalLabel : `Latest matching signal: ${latestSignalLabel}`}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <span style={{ color: "#94a3b8" }}>News feeds</span>
            <span style={{ color: "#f8fafc", fontWeight: 600 }}>{newsLabel}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <span style={{ color: "#94a3b8" }}>AI reports</span>
            <span style={{ color: "#f8fafc", fontWeight: 600 }}>{aiStatusLabel}</span>
          </div>
        </div>
        <div style={{ color: "#94a3b8", fontSize: 13, lineHeight: 1.7 }}>
          {canGenerate
            ? "Generation is manual, budget-controlled, and uses stored Grigori event data only."
            : "Reports use manual AI-assisted generation during private preview. Public visitors cannot trigger report generation."}
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {session?.user ? <PremiumBadge tone="success">Signed In</PremiumBadge> : null}
          {adminUnlocked ? <PremiumBadge tone="success">Operator Mode</PremiumBadge> : null}
        </div>
      </div>
      <div style={{ border: "1px solid rgba(51,65,85,0.9)", background: "rgba(4,10,22,0.88)", borderRadius: 20, padding: 18 }}>
        <div style={{ color: "#7dd3fc", fontSize: 11, fontFamily: MONO_FONT, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 10 }}>
          Available Data Summary
        </div>
        <div style={{ display: "grid", gap: 10, color: "#cbd5e1", lineHeight: 1.7 }}>
          <div>{summary?.totalSignals ?? 0} stored signals available across live and historical context.</div>
          <div>{status?.aiProvider ? `${status.aiProvider} is the only AI provider enabled for reports.` : "AI provider unavailable."}</div>
          <div>{summary?.matchingSignals ?? 0} signals currently match the selected lens and horizon.</div>
        </div>
      </div>
    </div>
  );
}

function buildCopyText(report) {
  const content = report?.content ?? report ?? {};
  return [
    report?.title ?? content.title ?? "Strategic Report",
    "",
    "Executive Summary",
    content.executiveSummary ?? "",
    "",
    "Key Judgments",
    ...(content.keyJudgments ?? []).map((item) => `- ${item}`),
    "",
    "Current Situation",
    content.currentSituation ?? "",
    "",
    "What Changed",
    ...(content.whatChanged ?? []).map((item) => `- ${item}`),
    "",
    "Trend Analysis",
    content.trendAnalysis ?? "",
    "",
    "Watch Indicators",
    ...(content.watchIndicators ?? []).map((item) => `- ${item}`),
  ].join("\n");
}

function ReportViewer({ report, onCopy, copied, isMobile }) {
  if (!report) return null;
  const content = report.content ?? report;
  const sourceCount = content.sources?.length ?? 0;
  return (
    <ShellCard
      title={content.title}
      eyebrow="Generated strategic briefing"
      actions={
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <PremiumBadge tone="info">{content.region}</PremiumBadge>
          <PremiumBadge>{content.focusArea}</PremiumBadge>
          <PremiumBadge tone="success">{content.confidenceAssessment?.level ?? report.confidence_level ?? "Medium"} confidence</PremiumBadge>
          <PremiumBadge>{sourceCount} sources</PremiumBadge>
          <PremiumBadge tone={content.aiStatus === "enriched" ? "success" : "warning"}>
            {content.aiStatus === "enriched" ? "Gemini Report" : "Rule-based Preview"}
          </PremiumBadge>
          <button
            onClick={onCopy}
            style={{
              border: "1px solid rgba(71,85,105,0.82)",
              borderRadius: 999,
              background: "rgba(15,23,42,0.82)",
              color: "#cbd5e1",
              padding: "8px 12px",
              cursor: "pointer",
              fontFamily: MONO_FONT,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              fontSize: 10,
            }}
          >
            {copied ? "Copied" : "Copy Brief"}
          </button>
        </div>
      }
    >
      <div style={{ display: "grid", gap: 20 }}>
        <div style={{ display: "grid", gap: 12, paddingBottom: 6, borderBottom: "1px solid rgba(51,65,85,0.72)" }}>
          <img src={BRAND_REPORT_LOCKUP} alt="Grigori by oryth.io Strategic Intelligence Dashboard" style={{ width: isMobile ? "min(100%, 340px)" : "min(100%, 520px)", height: "auto" }} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <PremiumBadge tone="info">Strategic Intelligence Dashboard</PremiumBadge>
            <PremiumBadge>{sourceCount} sources</PremiumBadge>
            <PremiumBadge tone={content.aiStatus === "enriched" ? "success" : "warning"}>
              {content.aiStatus === "enriched" ? "AI-assisted" : "Rule-based"}
            </PremiumBadge>
            <PremiumBadge>Not financial advice</PremiumBadge>
          </div>
        </div>
        <div style={{ color: "#94a3b8", fontSize: 13, lineHeight: 1.7 }}>
          Generated {new Date(report.generated_at ?? content.generatedAt ?? report.created_at ?? Date.now()).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })} · {content.timeHorizon} · {content.audienceType} · {content.riskFraming}
        </div>

        <div style={{ display: "grid", gap: 12 }}>
          <FieldLabel>Executive Summary</FieldLabel>
          <div style={{ color: "#e2e8f0", lineHeight: 1.85, fontSize: 15 }}>{content.executiveSummary}</div>
        </div>

        <div style={{ display: "grid", gap: 12 }}>
          <FieldLabel>Key Judgments</FieldLabel>
          <div style={{ display: "grid", gap: 8 }}>
            {(content.keyJudgments ?? []).map((item) => (
              <div key={item} style={{ color: "#d9e5f4", lineHeight: 1.7, display: "flex", gap: 10 }}>
                <span style={{ color: "#7dd3fc" }}>•</span>
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gap: 12 }}>
          <FieldLabel>Current Situation</FieldLabel>
          <div style={{ color: "#dce7f4", lineHeight: 1.85, whiteSpace: "pre-wrap" }}>{content.currentSituation}</div>
        </div>

        <div style={{ display: "grid", gap: 12 }}>
          <FieldLabel>What Changed</FieldLabel>
          <div style={{ display: "grid", gap: 8 }}>
            {(content.whatChanged ?? []).map((item) => (
              <div key={item} style={{ color: "#cbd5e1", lineHeight: 1.7, display: "flex", gap: 10 }}>
                <span style={{ color: "#fbbf24" }}>•</span>
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gap: 12 }}>
          <FieldLabel>Trend Analysis</FieldLabel>
          <div style={{ color: "#dce7f4", lineHeight: 1.85 }}>{content.trendAnalysis}</div>
        </div>

        <div style={{ display: "grid", gap: 12 }}>
          <FieldLabel>Scenario Matrix</FieldLabel>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))", gap: 14 }}>
            {(content.scenarioMatrix ?? []).map((scenario) => (
              <div key={scenario.name} style={{ border: "1px solid rgba(51,65,85,0.9)", background: "rgba(4,10,22,0.92)", borderRadius: 18, padding: 16, display: "grid", gap: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                  <div style={{ color: "#f8fafc", fontWeight: 700 }}>{scenario.name}</div>
                  <PremiumBadge tone="warning">{scenario.probability}%</PremiumBadge>
                </div>
                <div style={{ color: "#dce7f4", lineHeight: 1.75 }}>{scenario.summary}</div>
                <div style={{ color: "#94a3b8", fontSize: 12, lineHeight: 1.7 }}>{scenario.implications}</div>
                <div style={{ display: "grid", gap: 6 }}>
                  {(scenario.triggers ?? []).map((trigger) => (
                    <div key={trigger} style={{ color: "#cbd5e1", fontSize: 13, lineHeight: 1.6 }}>• {trigger}</div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {(scenario.affectedSectors ?? []).map((sector) => <PremiumBadge key={sector}>{sector}</PremiumBadge>)}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.1fr 0.9fr", gap: 16 }}>
          <div style={{ display: "grid", gap: 12 }}>
            <FieldLabel>Market Impact</FieldLabel>
            <div style={{ display: "grid", gap: 8, color: "#dce7f4", lineHeight: 1.75 }}>
              <div><strong style={{ color: "#f8fafc" }}>Oil:</strong> {content.marketImpact?.oil}</div>
              <div><strong style={{ color: "#f8fafc" }}>Shipping:</strong> {content.marketImpact?.shipping}</div>
              <div><strong style={{ color: "#f8fafc" }}>Equities:</strong> {content.marketImpact?.equities}</div>
              <div><strong style={{ color: "#f8fafc" }}>Defense:</strong> {content.marketImpact?.defense}</div>
              <div><strong style={{ color: "#f8fafc" }}>Tech:</strong> {content.marketImpact?.tech}</div>
              <div style={{ color: "#cbd5e1" }}>{content.marketImpact?.summary}</div>
            </div>
          </div>
          <div style={{ display: "grid", gap: 12 }}>
            <FieldLabel>Watch Indicators</FieldLabel>
            <div style={{ display: "grid", gap: 7 }}>
              {(content.watchIndicators ?? []).map((indicator) => (
                <div key={indicator} style={{ color: "#dbe7f5", lineHeight: 1.7, display: "flex", gap: 10 }}>
                  <span style={{ color: "#7dd3fc" }}>□</span>
                  <span>{indicator}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
          <div style={{ display: "grid", gap: 12 }}>
            <FieldLabel>Confidence & Sources</FieldLabel>
            <div style={{ color: "#dce7f4", lineHeight: 1.75 }}>
              <div style={{ marginBottom: 8 }}><strong style={{ color: "#f8fafc" }}>Confidence:</strong> {content.confidenceAssessment?.level}</div>
              <div>{content.confidenceAssessment?.rationale}</div>
              <div style={{ marginTop: 10, color: "#94a3b8" }}>
                {content.sourceAssessment?.sourceCount ?? 0} source signals · {content.sourceAssessment?.sourceDiversity} · {content.sourceAssessment?.corroborationLevel}
              </div>
            </div>
          </div>
          <div style={{ display: "grid", gap: 12 }}>
            <FieldLabel>Limitations</FieldLabel>
            <div style={{ display: "grid", gap: 7 }}>
              {(content.limitations ?? []).map((item) => (
                <div key={item} style={{ color: "#dbe7f5", lineHeight: 1.7, display: "flex", gap: 10 }}>
                  <span style={{ color: "#fbbf24" }}>•</span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gap: 12 }}>
          <FieldLabel>Sources</FieldLabel>
          <div style={{ display: "grid", gap: 8 }}>
            {(content.sources ?? []).map((source, index) => (
              <a
                key={`${source.domain}-${source.url}-${index}`}
                href={source.url || "#"}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: "grid",
                  gap: 4,
                  border: "1px solid rgba(51,65,85,0.9)",
                  background: "rgba(4,10,22,0.88)",
                  borderRadius: 14,
                  padding: 14,
                  color: "#cfe4ff",
                  textDecoration: "none",
                  wordBreak: "break-word",
                }}
              >
                <div style={{ color: "#f8fafc", fontWeight: 700 }}>{source.domain}</div>
                <div style={{ color: "#cbd5e1", fontSize: 13 }}>{source.title}</div>
                {source.url ? <div style={{ color: "#7dd3fc", fontSize: 12 }}>{source.url}</div> : null}
              </a>
            ))}
          </div>
        </div>
      </div>
    </ShellCard>
  );
}

function HistoryList({ reports, onOpen }) {
  if (reports.length === 0) {
    return <div style={{ color: "#94a3b8", lineHeight: 1.7 }}>Generated reports will appear here once test reports are saved.</div>;
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {reports.map((report) => (
        <button
          key={report.id}
          onClick={() => onOpen?.(report)}
          style={{
            border: "1px solid rgba(51,65,85,0.9)",
            background: "rgba(6,12,24,0.9)",
            borderRadius: 16,
            padding: 16,
            textAlign: "left",
            cursor: "pointer",
            color: "inherit",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 8, flexWrap: "wrap" }}>
            <div style={{ color: "#f8fafc", fontWeight: 700 }}>{report.title}</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <PremiumBadge>{String(report.ai_provider ?? "Gemini").replace(/^gemini$/i, "Gemini")}</PremiumBadge>
              <PremiumBadge tone="success">{report.confidence_level ?? report.content?.confidenceAssessment?.level ?? "Medium"}</PremiumBadge>
            </div>
          </div>
          <div style={{ color: "#94a3b8", fontSize: 13, lineHeight: 1.6 }}>
            {new Date(report.generated_at ?? report.created_at).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })} · {report.region} · {report.focus_area}
          </div>
        </button>
      ))}
    </div>
  );
}

function WaitlistAdminPanel({ entries, status, onLoad }) {
  return (
    <ShellCard title="Waitlist Operator View" eyebrow="Protected access">
      <div style={{ color: "#cbd5e1", lineHeight: 1.8, marginBottom: 16 }}>
        Load waitlist entries with the protected operator secret. This gives you a manual contact queue until mailing list sync is ready.
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
            fontFamily: MONO_FONT,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          Load Waitlist
        </button>
        {status ? (
          <span style={{ color: status.type === "error" ? "#fda4af" : "#93c5fd", fontSize: 12, fontFamily: MONO_FONT }}>
            {status.message}
          </span>
        ) : null}
      </div>

      {entries.length === 0 ? (
        <div style={{ color: "#94a3b8", lineHeight: 1.7 }}>No entries loaded yet.</div>
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

const INITIAL_REPORT_FORM = {
  region: REPORT_INPUT_OPTIONS.regions[0],
  focusArea: REPORT_INPUT_OPTIONS.focusAreas[REPORT_INPUT_OPTIONS.focusAreas.length - 1],
  timeHorizon: REPORT_INPUT_OPTIONS.timeHorizons[1],
  audienceType: REPORT_INPUT_OPTIONS.audienceTypes[0],
  riskFraming: REPORT_INPUT_OPTIONS.riskAppetites[1],
  customQuestion: "",
};

export default function ReportsApp({ activeView = "reports", onNavigate }) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const authConfigured = Boolean(supabase);
  const [viewportWidth, setViewportWidth] = useState(() => (typeof window === "undefined" ? 1280 : window.innerWidth));
  const [session, setSession] = useState(null);
  const [adminToken, setAdminToken] = useState("");
  const [authMode, setAuthMode] = useState("login");
  const [authForm, setAuthForm] = useState({ email: "", password: "" });
  const [authMessage, setAuthMessage] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [reportStatus, setReportStatus] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyState, setHistoryState] = useState({ status: "idle", message: "" });
  const [previewStatus, setPreviewStatus] = useState(null);
  const [reportForm, setReportForm] = useState(INITIAL_REPORT_FORM);
  const [generatedReport, setGeneratedReport] = useState(null);
  const [copyStatus, setCopyStatus] = useState(false);
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

  const accessToken = session?.access_token || adminToken || null;
  const adminUnlocked = Boolean(adminToken);
  const isMobile = viewportWidth < 768;
  const isTablet = viewportWidth >= 768 && viewportWidth <= 1024;

  const shellPaddingX = isMobile ? 14 : isTablet ? 18 : 24;
  const shellTopPadding = isMobile ? 136 : isTablet ? 124 : 112;
  const heroGrid = isMobile ? "1fr" : "1.08fr 0.92fr";
  const topGrid = isMobile ? "1fr" : "1.15fr 0.85fr";
  const lowerGrid = isMobile ? "1fr" : "1fr 1fr";
  const planGrid = isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))";

  const loadReportsData = useCallback(async (activeSession, currentAdminToken, form = reportForm) => {
    const token = activeSession?.access_token || currentAdminToken || null;
    const query = new URLSearchParams({
      region: form.region,
      focusArea: form.focusArea,
      timeHorizon: form.timeHorizon,
      audienceType: form.audienceType,
      riskFraming: form.riskFraming,
    });

    const [subscriptionData, statusData, historyData] = await Promise.all([
      authedFetch("/api/v1/subscription/status", activeSession?.access_token || null),
      authedFetch(`/api/v1/reports/status?${query.toString()}`, token),
      token ? authedFetch("/api/v1/reports/history?limit=12", token) : Promise.resolve({ reports: [] }),
    ]);
    setSubscription(subscriptionData);
    setReportStatus(statusData);
    setHistory(historyData.reports ?? []);
  }, [reportForm]);

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
      loadReportsData(data.session ?? null, adminToken).catch(() => {});
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession ?? null);
      loadReportsData(nextSession ?? null, adminToken).catch(() => {});
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, [supabase, loadReportsData, adminToken]);

  useEffect(() => {
    if (supabase) return;
    loadReportsData(null, adminToken).catch(() => {});
  }, [supabase, loadReportsData, adminToken]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadReportsData(session, adminToken, reportForm).catch(() => {});
    }, 180);
    return () => window.clearTimeout(timer);
  }, [session, adminToken, reportForm.region, reportForm.focusArea, reportForm.timeHorizon, reportForm.audienceType, reportForm.riskFraming, loadReportsData]);

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
    setGeneratedReport(null);
  }, [supabase]);

  const handleAdminUnlock = useCallback(async () => {
    const secret = window.prompt("Enter operator secret to unlock report generation.");
    if (!secret) return;
    setAdminToken(secret);
    setPreviewStatus({ type: "success", message: "Operator mode unlocked for report testing." });
    await loadReportsData(session, secret, reportForm).catch(() => {});
  }, [loadReportsData, reportForm, session]);

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
    } catch {
      setWaitlistStatus({ type: "error", message: "We couldn't save your request just now. Please try again shortly." });
    }
  }, [waitlistForm]);

  const handleLoadWaitlist = useCallback(async () => {
    const secret = adminToken || window.prompt("Enter operator secret to load waitlist entries.");
    if (!secret) return;
    if (!adminToken) setAdminToken(secret);
    setAdminWaitlistStatus({ type: "info", message: "Loading waitlist..." });
    try {
      const data = await authedFetch("/api/v1/reports/waitlist?limit=200", secret, {
        method: "GET",
      });
      setWaitlistEntries(data.entries ?? []);
      setAdminWaitlistStatus({ type: "success", message: `Loaded ${data.total ?? (data.entries ?? []).length} waitlist entries.` });
    } catch (error) {
      setAdminWaitlistStatus({ type: "error", message: error.message || "Unable to load waitlist entries." });
    }
  }, [adminToken]);

  const handleGenerateReport = useCallback(async (event) => {
    event.preventDefault();
    setPreviewStatus(null);
    setHistoryState({ status: "running", message: "Generating strategic briefing..." });
    try {
      if (!accessToken) {
        throw new Error("Sign in or unlock admin mode to generate reports.");
      }
      const data = await authedFetch("/api/v1/reports/generate", accessToken, {
        method: "POST",
        body: JSON.stringify(reportForm),
      });
      if (data.report) {
        setGeneratedReport(data.report);
      }
      setPreviewStatus({ type: "success", message: data.message || "Report generated." });
      setHistoryState({ status: "ready", message: "" });
      await loadReportsData(session, adminToken, reportForm);
    } catch (error) {
      setPreviewStatus({ type: "error", message: error.message || "Report generation failed." });
      setHistoryState({ status: "error", message: error.message || "Report generation failed." });
    }
  }, [accessToken, adminToken, loadReportsData, reportForm, session]);

  const handleCopy = useCallback(async () => {
    if (!generatedReport) return;
    try {
      await navigator.clipboard.writeText(buildCopyText(generatedReport));
      setCopyStatus(true);
      window.setTimeout(() => setCopyStatus(false), 1400);
    } catch {
      setCopyStatus(false);
    }
  }, [generatedReport]);

  const usage = reportStatus?.usage ?? subscription?.usage;
  const generationAllowed = Boolean(reportStatus?.generationAllowed);

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
          <div style={{ display: "grid", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", minWidth: 0 }}>
            <img src={BRAND_WORDMARK} alt="Grigori by oryth.io" style={{ height: isMobile ? 26 : 34, width: "auto", maxWidth: isMobile ? 196 : 262 }} />
          </div>
          <div style={{ color: "#70d7f2", fontFamily: MONO_FONT, fontSize: isMobile ? 10 : 11, letterSpacing: isMobile ? "0.12em" : "0.16em", textTransform: "uppercase", marginLeft: 2 }}>
            Strategic Intelligence Dashboard
          </div>
          </div>
          <div style={{ display: "grid", gap: 12, justifyItems: isMobile ? "stretch" : "end", width: isMobile ? "100%" : "auto" }}>
            <HeaderNav activeView={activeView} onNavigate={onNavigate} />
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: isMobile ? "flex-start" : "flex-end" }}>
              <PremiumBadge tone="warning">Reports Preview</PremiumBadge>
              <PremiumBadge>Private Preview</PremiumBadge>
              <PremiumBadge tone="success">Operational</PremiumBadge>
            </div>
          </div>
        </div>

        <ShellCard title="Personalized Intelligence Reports" eyebrow="Private Preview" accent="rgba(125, 211, 252, 0.32)">
          <div style={{ display: "flex", justifyContent: "space-between", gap: isMobile ? 16 : 20, flexWrap: "wrap", alignItems: "flex-start" }}>
            <div style={{ maxWidth: 760 }}>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
                <PremiumBadge tone="warning">{REPORT_STATUS_BADGE}</PremiumBadge>
                <PremiumBadge>{adminUnlocked ? "AI Provider · Gemini" : "AI-assisted"}</PremiumBadge>
              </div>
              <p style={{ color: "#cbd5e1", lineHeight: 1.8, fontSize: isMobile ? 15 : 16, margin: 0 }}>
                Generate focused strategic briefings from Grigori’s live and historical signal base.
              </p>
              <p style={{ color: "#94a3b8", lineHeight: 1.8, fontSize: isMobile ? 14 : 15, marginTop: 12 }}>
                {REPORTS_WIP_COPY}
              </p>
              <p style={{ color: "#94a3b8", lineHeight: 1.8, fontSize: isMobile ? 14 : 15, marginTop: 10 }}>
                Public Preview includes the globe, active signals, and selected briefings. Paid Preview adds personalized reports, watchlists, exports, and deeper scenario context.
              </p>
            </div>
            <div style={{ display: "grid", gap: 10, width: isMobile ? "100%" : "auto", minWidth: isMobile ? 0 : 260 }}>
              <button style={{ border: "1px solid rgba(125,211,252,0.28)", borderRadius: 999, background: "rgba(56,189,248,0.16)", color: "#f8fafc", padding: "11px 16px", cursor: "pointer", fontFamily: MONO_FONT, textTransform: "uppercase", letterSpacing: isMobile ? "0.08em" : "0.12em", width: "100%" }}>
                Upgrade to Analyst
              </button>
              <button style={{ border: "1px solid rgba(196,181,253,0.28)", borderRadius: 999, background: "rgba(76,29,149,0.16)", color: "#f8fafc", padding: "11px 16px", cursor: "pointer", fontFamily: MONO_FONT, textTransform: "uppercase", letterSpacing: isMobile ? "0.08em" : "0.12em", width: "100%" }}>
                Upgrade to Strategic
              </button>
              <button onClick={() => setAuthMode(authConfigured ? "login" : "signup")} style={{ border: "1px solid rgba(71,85,105,0.82)", borderRadius: 999, background: "rgba(15,23,42,0.82)", color: "#f8fafc", padding: "11px 16px", cursor: "pointer", fontFamily: MONO_FONT, textTransform: "uppercase", letterSpacing: isMobile ? "0.08em" : "0.12em", width: "100%" }}>
                {authConfigured ? "Sign In" : "Join Early Access"}
              </button>
            </div>
          </div>
        </ShellCard>

        <div style={{ display: "grid", gridTemplateColumns: topGrid, gap: 22 }}>
          <ShellCard title="Reports Alpha" eyebrow="Configuration">
            <div style={{ color: "#cbd5e1", lineHeight: 1.8, marginBottom: 18 }}>
              Configure region, focus, audience, and risk framing. Report generation is always manual and uses stored Grigori events only.
            </div>
            <ReportConfigForm
              form={reportForm}
              setForm={setReportForm}
              onGenerate={handleGenerateReport}
              generating={historyState.status === "running"}
              generationAllowed={generationAllowed}
              statusMessage={previewStatus}
              isMobile={isMobile}
            />
          </ShellCard>

          <ShellCard title="Alpha Usage & Signal Match" eyebrow={adminUnlocked ? "Gemini budget" : "Manual generation"}>
            <UsageCard
              status={reportStatus}
              session={session}
              adminUnlocked={adminUnlocked}
              onAdminUnlock={handleAdminUnlock}
            />
          </ShellCard>
        </div>

        {generatedReport ? (
          <ReportViewer
            report={generatedReport}
            onCopy={handleCopy}
            copied={copyStatus}
            isMobile={isMobile}
          />
        ) : (
          <ShellCard title="Briefing Output" eyebrow="Document viewer">
            <div style={{ color: "#cbd5e1", lineHeight: 1.8, marginBottom: 18 }}>
              Generated reports will appear here as a structured intelligence briefing with scenario cards, watch indicators, confidence notes, and separated source transparency.
            </div>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 18 }}>
              <div>
                <div style={{ color: "#7dd3fc", fontSize: 11, fontFamily: MONO_FONT, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 10 }}>
                  Planned Output Sections
                </div>
                <div style={{ display: "grid", gap: 8 }}>
                  {REPORT_OUTPUT_SECTIONS.map((section) => (
                    <div key={section} style={{ color: "#cbd5e1", lineHeight: 1.6 }}>• {section}</div>
                  ))}
                </div>
              </div>
              <div style={{ border: "1px solid rgba(51,65,85,0.9)", background: "rgba(4,10,22,0.9)", borderRadius: 18, padding: 18 }}>
                <div style={{ color: "#7dd3fc", fontSize: 11, fontFamily: MONO_FONT, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 10 }}>
                  Preview Guardrails
                </div>
                <div style={{ display: "grid", gap: 10, color: "#cbd5e1", lineHeight: 1.7 }}>
                  <div>Reports use manual AI-assisted generation during private preview.</div>
                  <div>No report calls run on page load or in the background.</div>
                  <div>Public users see preview mode only and cannot burn report AI calls.</div>
                </div>
              </div>
            </div>
          </ShellCard>
        )}

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
            <InterestForm form={waitlistForm} setForm={setWaitlistForm} onSubmit={handleWaitlist} status={waitlistStatus} compact={isMobile} />
          </ShellCard>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: lowerGrid, gap: 22 }}>
          <ShellCard title="Report History" eyebrow="Saved briefings">
            {historyState.message ? (
              <div style={{ color: historyState.status === "error" ? "#fda4af" : "#93c5fd", fontFamily: MONO_FONT, fontSize: 12, marginBottom: 12 }}>
                {historyState.message}
              </div>
            ) : null}
            <HistoryList reports={history} onOpen={setGeneratedReport} />
          </ShellCard>

          <ShellCard title="Why Reports Alpha" eyebrow="Product direction">
            <div style={{ color: "#cbd5e1", lineHeight: 1.8, marginBottom: 18 }}>
              Reports Alpha is designed as a briefing room rather than a chatbot. The objective is to turn Grigori’s signal base into analyst-quality, source-aware, decision-useful strategic reporting.
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              {[
                "Manual generation only — no hidden AI burn on page load.",
                "Scenario matrix with explicit probabilities and triggers.",
                "Market impact and sector implications without financial advice.",
                "Sources remain separate from narrative analysis.",
              ].map((item) => (
                <div key={item} style={{ border: "1px solid rgba(51,65,85,0.9)", background: "rgba(4,10,22,0.9)", borderRadius: 14, padding: 14, color: "#e2e8f0" }}>
                  {item}
                </div>
              ))}
            </div>
          </ShellCard>
        </div>

        <SampleReportsSection isMobile={isMobile} />

        <div style={{ display: "grid", gridTemplateColumns: planGrid, gap: 18 }}>
          {PREMIUM_PLANS.map((plan, index) => (
            <PlanCard key={plan.tier} plan={plan} emphasized={index === 1} actionLabel={plan.tier === "strategic" ? "Join Reports Preview" : "Request Early Access"} />
          ))}
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
            {showAdminWaitlist ? "Hide Operator Tools" : "Operator Access"}
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

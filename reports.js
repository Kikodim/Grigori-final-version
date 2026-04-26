import crypto from "crypto";
import { BRAND, getTierConfig, PREMIUM_PLANS, REPORT_OUTPUT_SECTIONS, REPORTS_WIP_COPY } from "./premium-config.js";
import { getClientIp, getBearerToken, requireAdmin } from "./security.js";
import {
  getAuthenticatedSupabaseUser,
  getEvents,
  getWaitlistEntries,
  getUserProfile,
  getUserReports,
  getUserWatchlists,
  saveUserReport,
  saveWaitlistEntry,
  upsertUserProfile,
} from "./supabase.js";

function dailyResetIso(now = Date.now()) {
  const date = new Date(now);
  date.setUTCHours(24, 0, 0, 0);
  return date.toISOString();
}

function tierUsageForProfile(profile) {
  const tier = getTierConfig(profile.subscription_tier ?? "free");
  const now = Date.now();
  const resetAt = Date.parse(profile.reset_daily_at ?? dailyResetIso(now));
  const needsReset = !Number.isFinite(resetAt) || resetAt <= now;
  const usedToday = needsReset ? 0 : Number(profile.reports_used_today ?? 0);
  const limit = Number(tier.reportsPerDay ?? 0);
  return {
    tier: tier.tier,
    tierName: tier.name,
    reportsPerDay: limit,
    reportsUsedToday: usedToday,
    remainingToday: Math.max(0, limit - usedToday),
    resetDailyAt: needsReset ? dailyResetIso(now) : profile.reset_daily_at,
  };
}

export async function getAuthenticatedPremiumUser(req) {
  const token = getBearerToken(req);
  if (!token) return null;

  const user = await getAuthenticatedSupabaseUser(token);
  if (!user) return null;

  const profile = await getUserProfile(user.id, user.email ?? "");
  const usage = tierUsageForProfile(profile);

  if (usage.resetDailyAt !== profile.reset_daily_at || usage.reportsUsedToday !== profile.reports_used_today) {
    await upsertUserProfile({
      ...profile,
      reports_used_today: usage.reportsUsedToday,
      reset_daily_at: usage.resetDailyAt,
    });
  }

  return { user, profile, usage, accessToken: token };
}

export async function buildSubscriptionStatus(req) {
  const auth = await getAuthenticatedPremiumUser(req);
  if (!auth) {
    return {
      ok: true,
      authenticated: false,
      checkoutEnabled: false,
      portalEnabled: false,
      profile: null,
      usage: tierUsageForProfile({ subscription_tier: "free", reports_used_today: 0, reset_daily_at: dailyResetIso() }),
      plans: PREMIUM_PLANS,
      badge: "Work in Progress",
      message: REPORTS_WIP_COPY,
    };
  }

  return {
    ok: true,
    authenticated: true,
    checkoutEnabled: false,
    portalEnabled: false,
    profile: auth.profile,
    usage: auth.usage,
    plans: PREMIUM_PLANS,
    badge: "Work in Progress",
    message: REPORTS_WIP_COPY,
  };
}

function buildPreviewContent(payload, events) {
  const topEvents = events.slice(0, 3);
  return {
    status: "preview_only",
    executiveSummary: `Premium report generation for ${payload.region} is being prepared. Grigori is already tracking ${events.length} relevant signals across the live dashboard.`,
    currentSituation: topEvents.map((event) => event.title),
    trendAnalysis: "Phase 1 preview mode uses current event density, source corroboration, and scenario direction to show the upcoming reporting structure.",
    historicalParallels: "Historical parallels and comparative baselines will be added in the full premium release.",
    scenarioMatrix: {
      bestCase: "Containment signals stabilize the operating picture without widening disruption.",
      baseCase: "The situation remains volatile and closely watched, with localized spillover risk.",
      worstCase: "Escalatory triggers align and push the theater into a higher-risk operating cycle.",
    },
    probabilityBands: [
      { label: "Best Case", probability: 25 },
      { label: "Base Case", probability: 50 },
      { label: "Worst Case", probability: 25 },
    ],
    marketImpact: "Market impact, sector sensitivity, and transport context will be folded into the paid generator when live.",
    sectorImpact: "Energy, shipping, defense, technology, and finance lenses are already mapped in the dashboard and will feed premium reports.",
    watchIndicators: [
      "Conflict intensity changes",
      "New corroborated sources",
      "Trade route disruption signals",
      "Official statements or sanctions moves",
    ],
    recommendedMonitoringActions: [
      "Maintain watchlist coverage on the selected region and focus area.",
      "Track event clustering velocity over the selected time horizon.",
      "Review scenario drift in the Globe and Intel Board before full report rollout.",
    ],
    sections: REPORT_OUTPUT_SECTIONS,
  };
}

export async function generatePreviewReport(req, payload) {
  const auth = await getAuthenticatedPremiumUser(req);
  if (!auth) {
    return { status: 401, body: { success: false, error: "Authentication required" } };
  }

  const usage = tierUsageForProfile(auth.profile);
  if (usage.reportsPerDay <= 0) {
    return { status: 402, body: { success: false, error: "Upgrade required to unlock premium reports", usage, badge: "Work in Progress" } };
  }

  if (usage.remainingToday <= 0) {
    return { status: 429, body: { success: false, error: "Daily report limit reached. Your allowance resets tomorrow.", usage } };
  }

  const eventsRes = await getEvents({ limit: 12, offset: 0, region: payload.region === "Global" ? undefined : payload.region });
  const report = {
    id: crypto.randomUUID(),
    user_id: auth.user.id,
    title: `${payload.region} · ${payload.focusArea} · ${payload.timeHorizon}`,
    region: payload.region,
    focus_area: payload.focusArea,
    time_horizon: payload.timeHorizon,
    audience_type: payload.audienceType,
    risk_appetite: payload.riskAppetite,
    status: "preview",
    content: buildPreviewContent(payload, eventsRes.events ?? []),
    favorite: false,
    created_at: new Date().toISOString(),
  };

  await saveUserReport(report);
  await upsertUserProfile({
    ...auth.profile,
    reports_used_today: usage.reportsUsedToday + 1,
    reset_daily_at: usage.resetDailyAt,
  });

  return {
    status: 202,
    body: {
      ok: true,
      badge: "Work in Progress",
      message: "Premium report generation is still being finalized. This preview shows the upcoming structure.",
      report,
      usage: {
        ...usage,
        reportsUsedToday: usage.reportsUsedToday + 1,
        remainingToday: Math.max(0, usage.remainingToday - 1),
      },
    },
  };
}

export async function getReportHistory(req, query = {}) {
  const auth = await getAuthenticatedPremiumUser(req);
  if (!auth) {
    return { status: 401, body: { success: false, error: "Authentication required" } };
  }

  const [history, watchlists] = await Promise.all([
    getUserReports(auth.user.id, { limit: Math.min(Number(query.limit ?? 20), 50), query: query.q ?? "" }),
    getUserWatchlists(auth.user.id),
  ]);

  return {
    status: 200,
    body: {
      ok: true,
      badge: "Work in Progress",
      reports: history.reports,
      watchlists: watchlists.watchlists,
      usage: auth.usage,
    },
  };
}

export async function exportReportPreview(req, reportId) {
  const auth = await getAuthenticatedPremiumUser(req);
  if (!auth) {
    return { status: 401, body: { success: false, error: "Authentication required" } };
  }

  return {
    status: 501,
    body: {
      success: false,
      error: "PDF export is not live yet",
      badge: "Work in Progress",
      reportId,
    },
  };
}

export async function captureWaitlistInterest(payload, req) {
  const email = String(payload.email ?? "").trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { status: 400, body: { success: false, error: "Valid email required" } };
  }

  const serializedNote = [
    payload.note ? `Notes: ${String(payload.note).trim()}` : "",
    payload.focusArea ? `Focus area: ${String(payload.focusArea).trim()}` : "",
    payload.intendedUseCase ? `Use case: ${String(payload.intendedUseCase).trim()}` : "",
    payload.linkedinProfile ? `LinkedIn: ${String(payload.linkedinProfile).trim()}` : "",
  ].filter(Boolean).join("\n");

  const saved = await saveWaitlistEntry({
    email,
    interestTier: payload.interestTier ?? "confidential",
    requestedRegion: payload.requestedRegion ?? "Global",
    note: serializedNote,
    source_ip: getClientIp(req),
  });

  if (saved.mode === "supabase" && saved.persisted === false) {
    return {
      status: 503,
      body: {
        success: false,
        error: "We couldn't save your request just now. Please try again shortly.",
      },
    };
  }

  return {
    status: 202,
    body: {
      ok: true,
      message: "Request received. You’re on the early access list for Grigori Reports.",
      brand: BRAND.fullName,
    },
  };
}

export async function getWaitlistAdminEntries(req, query = {}) {
  if (!requireAdmin(req)) {
    return { status: 401, body: { success: false, error: "Unauthorized" } };
  }

  const limit = Math.min(Math.max(Number(query.limit ?? 200), 1), 500);
  const result = await getWaitlistEntries({ limit });

  return {
    status: 200,
    body: {
      ok: true,
      mode: result.mode,
      total: result.entries.length,
      entries: result.entries,
    },
  };
}

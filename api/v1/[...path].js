import { loadEnv } from "../../load-env.js";
import {
  handleAIStatus,
  handleBriefing,
  handleEventById,
  handleEvents,
  handleEventStats,
  handleFlightsLive,
  handleHealth,
  handlePipelineRun,
  handleReportsExport,
  handleReportsGenerate,
  handleReportsHistory,
  handleReportsWaitlist,
  handleSatellitesLive,
  handleSocialSignalsLive,
  handleSubscriptionStatus,
} from "../../api-handlers.js";

loadEnv();

function normalizePath(req) {
  const rawPath = req.query?.path;
  const pathParts = Array.isArray(rawPath)
    ? rawPath
        .flatMap((part) => String(part ?? "").split("/"))
        .filter(Boolean)
    : typeof rawPath === "string"
      ? rawPath.split("/").filter(Boolean)
      : [];

  if (pathParts.length > 0) {
    return pathParts.filter(Boolean);
  }

  try {
    const url = new URL(req.url, "http://localhost");
    return url.pathname.replace(/^\/api\/v1\//, "").split("/").filter(Boolean);
  } catch {
    return [];
  }
}

export default async function handler(req, res) {
  const parts = normalizePath(req);
  const method = req.method ?? "GET";

  if (parts.length === 0 || (parts.length === 1 && parts[0] === "health")) {
    if (method !== "GET") return res.status(405).json({ success: false, error: "Method not allowed" });
    return handleHealth(req, res);
  }

  if (parts[0] === "events") {
    if (parts.length === 1) {
      if (method !== "GET") return res.status(405).json({ success: false, error: "Method not allowed" });
      return handleEvents(req, res);
    }
    if (parts.length === 2 && parts[1] === "stats") {
      if (method !== "GET") return res.status(405).json({ success: false, error: "Method not allowed" });
      return handleEventStats(req, res);
    }
    if (parts.length === 2) {
      req.query = { ...(req.query ?? {}), id: parts[1] };
      if (method !== "GET") return res.status(405).json({ success: false, error: "Method not allowed" });
      return handleEventById(req, res);
    }
  }

  if (parts[0] === "pipeline" && parts[1] === "run") {
    if (method !== "POST") return res.status(405).json({ success: false, error: "Method not allowed" });
    return handlePipelineRun(req, res);
  }

  if (parts[0] === "admin" && parts[1] === "refresh") {
    if (method !== "POST") return res.status(405).json({ success: false, error: "Method not allowed" });
    return handlePipelineRun(req, res);
  }

  if (parts[0] === "ai" && parts[1] === "status") {
    if (method !== "GET") return res.status(405).json({ success: false, error: "Method not allowed" });
    return handleAIStatus(req, res);
  }

  if (parts[0] === "briefing") {
    if (method !== "GET") return res.status(405).json({ success: false, error: "Method not allowed" });
    return handleBriefing(req, res);
  }

  if (parts[0] === "flights" && parts[1] === "live") {
    if (method !== "GET") return res.status(405).json({ success: false, error: "Method not allowed" });
    return handleFlightsLive(req, res);
  }

  if (parts[0] === "satellites" && parts[1] === "live") {
    if (method !== "GET") return res.status(405).json({ success: false, error: "Method not allowed" });
    return handleSatellitesLive(req, res);
  }

  if (parts[0] === "social" && parts[1] === "live") {
    if (method !== "GET") return res.status(405).json({ success: false, error: "Method not allowed" });
    return handleSocialSignalsLive(req, res);
  }

  if (parts[0] === "subscription" && parts[1] === "status") {
    if (method !== "GET") return res.status(405).json({ success: false, error: "Method not allowed" });
    return handleSubscriptionStatus(req, res);
  }

  if (parts[0] === "reports") {
    if (parts[1] === "history") {
      if (method !== "GET") return res.status(405).json({ success: false, error: "Method not allowed" });
      return handleReportsHistory(req, res);
    }
    if (parts[1] === "generate") {
      if (method !== "POST") return res.status(405).json({ success: false, error: "Method not allowed" });
      return handleReportsGenerate(req, res);
    }
    if (parts[1] === "export") {
      if (method !== "GET") return res.status(405).json({ success: false, error: "Method not allowed" });
      return handleReportsExport(req, res);
    }
    if (parts[1] === "waitlist") {
      if (method !== "POST" && method !== "GET") return res.status(405).json({ success: false, error: "Method not allowed" });
      return handleReportsWaitlist(req, res);
    }
  }

  return res.status(404).json({ success: false, error: `Unknown API route: /api/v1/${parts.join("/")}` });
}

import { Router } from "express";
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
  handleSubscriptionStatus,
} from "./api-handlers.js";

export const eventsRouter = Router();
eventsRouter.get("/health", handleHealth);
eventsRouter.get("/briefing", handleBriefing);
eventsRouter.get("/events", handleEvents);
eventsRouter.get("/events/stats", handleEventStats);
eventsRouter.get("/events/:id", handleEventById);
eventsRouter.get("/ai/status", handleAIStatus);
eventsRouter.get("/subscription/status", handleSubscriptionStatus);
eventsRouter.get("/reports/history", handleReportsHistory);
eventsRouter.get("/reports/export", handleReportsExport);
eventsRouter.post("/reports/generate", handleReportsGenerate);
eventsRouter.post("/reports/waitlist", handleReportsWaitlist);
eventsRouter.get("/flights/live", handleFlightsLive);
eventsRouter.get("/satellites/live", handleSatellitesLive);
eventsRouter.post("/pipeline/run", handlePipelineRun);
eventsRouter.post("/admin/refresh", handlePipelineRun);

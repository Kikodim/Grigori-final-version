import { Router } from "express";
import {
  handleAIStatus,
  handleBriefing,
  handleEventById,
  handleEvents,
  handleEventStats,
  handleFlightsLive,
  handleHealth,
  handleLayersStatus,
  handlePipelineRun,
  handleSatellitesLive,
  handleVesselsLive,
} from "./api-handlers.js";

export const eventsRouter = Router();
eventsRouter.get("/health", handleHealth);
eventsRouter.get("/briefing", handleBriefing);
eventsRouter.get("/events", handleEvents);
eventsRouter.get("/events/stats", handleEventStats);
eventsRouter.get("/events/:id", handleEventById);
eventsRouter.get("/ai/status", handleAIStatus);
eventsRouter.get("/flights/live", handleFlightsLive);
eventsRouter.get("/vessels/live", handleVesselsLive);
eventsRouter.get("/satellites/live", handleSatellitesLive);
eventsRouter.get("/layers/status", handleLayersStatus);
eventsRouter.post("/pipeline/run", handlePipelineRun);
eventsRouter.post("/admin/refresh", handlePipelineRun);

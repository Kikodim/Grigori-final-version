import { Router } from "express";
import {
  handleAIStatus,
  handleEventById,
  handleEvents,
  handleEventStats,
  handleHealth,
  handlePipelineRun,
} from "./api-handlers.js";

export const eventsRouter = Router();
eventsRouter.get("/health", handleHealth);
eventsRouter.get("/events", handleEvents);
eventsRouter.get("/events/stats", handleEventStats);
eventsRouter.get("/events/:id", handleEventById);
eventsRouter.get("/ai/status", handleAIStatus);
eventsRouter.post("/pipeline/run", handlePipelineRun);

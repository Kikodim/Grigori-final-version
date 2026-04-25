import cors from "cors";
import express from "express";
import fs from "fs";
import cron from "node-cron";
import path from "path";
import { fileURLToPath } from "url";
import { getConfig } from "./config.js";
import { eventsRouter } from "./events.router.js";
import { createLogger } from "./logger.js";
import { runPipeline } from "./pipeline.js";

const log = createLogger("server");
const config = getConfig();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, "dist");
const hasFrontendBuild = fs.existsSync(path.join(distDir, "index.html"));

const app = express();

app.use(cors());
app.use(express.json());
app.use("/api/v1", eventsRouter);

if (hasFrontendBuild) {
  app.use(express.static(distDir));
}

app.get("/health", (_req, res) => {
  res.redirect(307, "/api/v1/health");
});

app.get("/", (_req, res) => {
  if (hasFrontendBuild) {
    return res.sendFile(path.join(distDir, "index.html"));
  }

  return res.json({
    ok: true,
    service: "grigori-the-watcher",
    endpoints: [
      "GET /api/v1/health",
      "GET /api/v1/events",
      "POST /api/v1/pipeline/run",
      "POST /api/v1/admin/refresh",
    ],
  });
});

if (hasFrontendBuild) {
  app.get(/^\/(?!api\/).*/, (_req, res) => {
    res.sendFile(path.join(distDir, "index.html"));
  });
}

app.use((req, res) => {
  res.status(404).json({ ok: false, error: `Not found: ${req.method} ${req.path}` });
});

app.use((err, _req, res, _next) => {
  log.error(`Unhandled error: ${err.message}`);
  res.status(500).json({ ok: false, error: "Internal server error" });
});

async function runScheduledPipeline(source) {
  try {
    const result = await runPipeline({ source: "automation" });
    log.info(`${source} pipeline run finished: ok=${result.ok} mode=${result.mode} events=${result.events}`);
  } catch (err) {
    log.error(`${source} pipeline run failed: ${err.message}`);
  }
}

function buildIntervalCron(minutes) {
  const interval = Math.max(1, parseInt(minutes ?? "90", 10));
  return `*/${interval} * * * *`;
}

function shouldRunPipelineOnStartup() {
  return String(process.env.RUN_PIPELINE_ON_STARTUP ?? "false").toLowerCase() === "true";
}

app.listen(config.port, () => {
  log.info(`Grigori backend listening on http://localhost:${config.port}`);
  log.info("Endpoints: GET /api/v1/health, GET /api/v1/events, POST /api/v1/pipeline/run, POST /api/v1/admin/refresh");

  if (shouldRunPipelineOnStartup()) {
    runScheduledPipeline("startup");
  } else {
    log.info("Startup pipeline disabled");
  }

  const schedule = process.env.INGEST_CRON ?? buildIntervalCron(process.env.INGEST_INTERVAL_MINUTES ?? "90");
  if (schedule) {
    cron.schedule(schedule, () => {
      runScheduledPipeline("cron");
    });
    log.info(`Cron enabled: ${schedule}`);
  }
});

export default app;

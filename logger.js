/**
 * logger.js — Minimal structured logger
 *
 * Prefixes every line with ISO timestamp and level.
 * Swap for pino/winston later without changing callers.
 */

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

function stamp() {
  return new Date().toISOString();
}

function currentLevel() {
  const level = (process.env.LOG_LEVEL ?? "info").toLowerCase();
  return LEVELS[level] ?? LEVELS.info;
}

function write(level, scope, method, args) {
  if (LEVELS[level] < currentLevel()) return;
  const prefix = scope ? `[${scope}]` : "";
  console[method](`${stamp()} [${level.toUpperCase()}] ${prefix}`.trim(), ...args);
}

export function createLogger(scope = "") {
  return {
    debug: (...args) => write("debug", scope, "debug", args),
    info: (...args) => write("info", scope, "log", args),
    warn: (...args) => write("warn", scope, "warn", args),
    error: (...args) => write("error", scope, "error", args),
  };
}

export const log = createLogger("app");

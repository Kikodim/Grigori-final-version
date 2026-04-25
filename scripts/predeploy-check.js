import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const root = process.cwd();
const requiredFiles = [
  "package.json",
  "vercel.json",
  "README.md",
  "DEPLOYMENT.md",
  ".gitignore",
  ".env.local.example",
  "index.html",
  "vite.config.js",
  "server.js",
  "bootstrap.js",
  "src/main.jsx",
  "api/v1/health.js",
  "api/v1/admin/refresh.js",
  "api/v1/briefing.js",
  "api/v1/events/index.js",
  "api/v1/events/[id].js",
  "api/v1/events/stats.js",
  "api/v1/pipeline/run.js",
  "schema.sql",
  "supabase_migration_grigori_ai_fields.sql",
];

let hasError = false;
let hasGit = false;

try {
  hasGit = execSync("git rev-parse --is-inside-work-tree", {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim() === "true";
} catch {
  hasGit = false;
}

for (const file of requiredFiles) {
  const fullPath = path.join(root, file);
  if (!fs.existsSync(fullPath)) {
    console.error(`Missing required file: ${file}`);
    hasError = true;
  }
}

const envLocalPath = path.join(root, ".env.local");
if (hasGit && fs.existsSync(envLocalPath)) {
  try {
    execSync("git check-ignore .env.local", { cwd: root, stdio: "ignore" });
  } catch {
    console.warn("Warning: .env.local exists but is not ignored by git.");
  }

  try {
    execSync("git ls-files --error-unmatch .env.local", { cwd: root, stdio: "ignore" });
    console.warn("Warning: .env.local is tracked by git. Remove it from the index before pushing.");
  } catch {
    // not tracked
  }
}

if (hasGit) {
  try {
    const trackedEnvFiles = execSync("git ls-files", {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
      .split("\n")
      .filter(Boolean)
      .filter((file) => file === ".env" || file === ".env.local");

    if (trackedEnvFiles.length > 0) {
      console.warn(`Warning: sensitive env files are tracked: ${trackedEnvFiles.join(", ")}`);
    }
  } catch {
    console.warn("Warning: unable to inspect git tracked files.");
  }
}

if (hasError) {
  process.exit(1);
}

console.log("Predeploy check passed.");

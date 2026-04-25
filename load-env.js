import fs from "fs";
import path from "path";
import dotenv from "dotenv";

let loaded = false;

export function loadEnv() {
  if (loaded) return;

  const cwd = process.cwd();

  for (const [file, override] of [
    [".env", false],
    [".env.local", true],
  ]) {
    const fullPath = path.join(cwd, file);
    if (fs.existsSync(fullPath)) {
      dotenv.config({ path: fullPath, override });
    }
  }

  loaded = true;
}

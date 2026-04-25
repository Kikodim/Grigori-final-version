import { loadEnv } from "../../load-env.js";
import { handleHealth } from "../../api-handlers.js";

loadEnv();

export default async function handler(req, res) {
  return handleHealth(req, res);
}

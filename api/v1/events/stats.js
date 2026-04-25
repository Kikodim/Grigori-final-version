import { loadEnv } from "../../../load-env.js";
import { handleEventStats } from "../../../api-handlers.js";

loadEnv();

export default async function handler(req, res) {
  return handleEventStats(req, res);
}

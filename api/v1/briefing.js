import { loadEnv } from "../../load-env.js";
import { handleBriefing } from "../../api-handlers.js";

loadEnv();

export default async function handler(req, res) {
  return handleBriefing(req, res);
}

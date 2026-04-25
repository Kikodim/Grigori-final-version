import { loadEnv } from "../../../load-env.js";
import { handleAIStatus } from "../../../api-handlers.js";

loadEnv();

export default async function handler(req, res) {
  return handleAIStatus(req, res);
}

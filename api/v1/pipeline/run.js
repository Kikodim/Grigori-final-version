import { loadEnv } from "../../../load-env.js";
import { handlePipelineRun } from "../../../api-handlers.js";

loadEnv();

export default async function handler(req, res) {
  return handlePipelineRun(req, res);
}

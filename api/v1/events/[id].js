import { loadEnv } from "../../../load-env.js";
import { handleEventById } from "../../../api-handlers.js";

loadEnv();

export default async function handler(req, res) {
  return handleEventById(req, res);
}

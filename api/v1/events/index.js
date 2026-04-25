import { loadEnv } from "../../../load-env.js";
import { handleEvents } from "../../../api-handlers.js";

loadEnv();

export default async function handler(req, res) {
  return handleEvents(req, res);
}

import { loadEnv } from "../../../load-env.js";
import { handleSubscriptionStatus } from "../../../api-handlers.js";

loadEnv();

export default async function handler(req, res) {
  return handleSubscriptionStatus(req, res);
}

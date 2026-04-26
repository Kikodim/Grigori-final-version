import { handleFlightsLive } from "../../../api-handlers.js";

export default async function handler(req, res) {
  return handleFlightsLive(req, res);
}

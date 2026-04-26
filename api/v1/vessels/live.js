import { handleVesselsLive } from "../../../api-handlers.js";

export default async function handler(req, res) {
  return handleVesselsLive(req, res);
}

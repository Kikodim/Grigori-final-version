import { handleSatellitesLive } from "../../../api-handlers.js";

export default async function handler(req, res) {
  return handleSatellitesLive(req, res);
}

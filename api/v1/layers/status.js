import { handleLayersStatus } from "../../../api-handlers.js";

export default async function handler(req, res) {
  return handleLayersStatus(req, res);
}

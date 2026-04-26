import { loadEnv } from "../../../load-env.js";
import {
  handleReportsExport,
  handleReportsGenerate,
  handleReportsHistory,
  handleReportsWaitlist,
} from "../../../api-handlers.js";

loadEnv();

export default async function handler(req, res) {
  const action = req.query?.action ?? req.query?.slug ?? req.query?.path;

  if (action === "history") {
    return handleReportsHistory(req, res);
  }

  if (action === "generate") {
    return handleReportsGenerate(req, res);
  }

  if (action === "export") {
    return handleReportsExport(req, res);
  }

  if (action === "waitlist") {
    return handleReportsWaitlist(req, res);
  }

  return res.status(404).json({ success: false, error: `Unknown reports route: ${action}` });
}

import { Router, type IRouter } from "express";
import { computeSloStatus } from "../lib/slo";

const router: IRouter = Router();

router.get("/slo/status", async (_req, res): Promise<void> => {
  const status = computeSloStatus();
  res.json(status);
});

export default router;

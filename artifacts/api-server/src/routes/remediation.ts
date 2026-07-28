import { Router, type IRouter } from "express";
import { desc } from "drizzle-orm";
import { db, remediationActionsTable } from "@workspace/db";
import {
  ListRemediationActionsQueryParams,
  TriggerRemediationActionBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/remediation/audit", async (req, res): Promise<void> => {
  const parsed = ListRemediationActionsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { limit = 50, offset = 0 } = parsed.data;

  const rows = await db
    .select()
    .from(remediationActionsTable)
    .orderBy(desc(remediationActionsTable.performedAt))
    .limit(limit)
    .offset(offset);

  res.json(
    rows.map((r) => ({
      id: r.id,
      trigger: r.trigger,
      action: r.action,
      outcome: r.outcome,
      metadata: r.metadata ?? null,
      performedAt: r.performedAt.toISOString(),
    }))
  );
});

router.post("/remediation/actions", async (req, res): Promise<void> => {
  const parsed = TriggerRemediationActionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [action] = await db
    .insert(remediationActionsTable)
    .values({
      trigger: parsed.data.trigger,
      action: parsed.data.action,
      outcome: "success",
      metadata: parsed.data.metadata,
    })
    .returning();

  res.status(201).json({
    id: action.id,
    trigger: action.trigger,
    action: action.action,
    outcome: action.outcome,
    metadata: action.metadata ?? null,
    performedAt: action.performedAt.toISOString(),
  });
});

export default router;

import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const remediationActionsTable = pgTable("remediation_actions", {
  id: serial("id").primaryKey(),
  trigger: text("trigger").notNull(),
  action: text("action").notNull(),
  outcome: text("outcome").notNull().default("success"), // success | failure | skipped
  metadata: text("metadata"), // JSON string
  performedAt: timestamp("performed_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertRemediationSchema = createInsertSchema(remediationActionsTable).omit({
  id: true,
  performedAt: true,
});
export type InsertRemediation = z.infer<typeof insertRemediationSchema>;
export type RemediationAction = typeof remediationActionsTable.$inferSelect;

import { doublePrecision, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

/** Periodic snapshots of SLO compliance for trend tracking. */
export const sloSnapshotsTable = pgTable("slo_snapshots", {
  id: serial("id").primaryKey(),
  indicator: text("indicator").notNull(),
  target: doublePrecision("target").notNull(),
  actual: doublePrecision("actual").notNull(),
  errorBudgetUsed: doublePrecision("error_budget_used").notNull().default(0),
  snapshotAt: timestamp("snapshot_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SloSnapshot = typeof sloSnapshotsTable.$inferSelect;

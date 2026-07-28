import { boolean, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

/** Single-row table holding current simulator config + running counters. Row id=1 always. */
export const simulatorStateTable = pgTable("simulator_state", {
  id: serial("id").primaryKey(),
  running: boolean("running").notNull().default(false),
  eventsPerSecond: integer("events_per_second").notNull().default(10),
  anomalyMode: text("anomaly_mode").notNull().default("none"),
  // none | temperature-spike | vibration-drift | malformed | offline | mixed
  dlqEnabled: boolean("dlq_enabled").notNull().default(true),
  totalEventsGenerated: integer("total_events_generated").notNull().default(0),
  totalEventsProcessed: integer("total_events_processed").notNull().default(0),
  totalEventsDlq: integer("total_events_dlq").notNull().default(0),
  startedAt: timestamp("started_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type SimulatorState = typeof simulatorStateTable.$inferSelect;

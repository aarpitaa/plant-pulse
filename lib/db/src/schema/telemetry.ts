import { boolean, doublePrecision, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/** Historical telemetry readings from all machines. Pruned to last ~2h. */
export const telemetryHistoryTable = pgTable("telemetry_history", {
  id: serial("id").primaryKey(),
  machineId: text("machine_id").notNull(),
  siteId: text("site_id").notNull(),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
  temperatureC: doublePrecision("temperature_c").notNull(),
  pressurePsi: doublePrecision("pressure_psi").notNull(),
  vibrationMmS: doublePrecision("vibration_mm_s").notNull(),
  status: text("status").notNull().default("running"),
  isAnomaly: boolean("is_anomaly").notNull().default(false),
});

export const insertTelemetrySchema = createInsertSchema(telemetryHistoryTable).omit({ id: true });
export type InsertTelemetry = z.infer<typeof insertTelemetrySchema>;
export type TelemetryHistory = typeof telemetryHistoryTable.$inferSelect;

/** Simulated Kafka event queue — topics: telemetry.raw | telemetry.valid | telemetry.dlq | incidents.detected */
export const eventQueueTable = pgTable("event_queue", {
  id: serial("id").primaryKey(),
  topic: text("topic").notNull(),
  key: text("key"), // machine_id
  value: text("value").notNull(), // JSON payload
  status: text("status").notNull().default("pending"), // pending | processed | dlq
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
});

export const insertEventSchema = createInsertSchema(eventQueueTable).omit({
  id: true,
  createdAt: true,
  processedAt: true,
});
export type InsertEvent = z.infer<typeof insertEventSchema>;
export type EventQueue = typeof eventQueueTable.$inferSelect;

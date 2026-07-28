import { pgTable, serial, text, timestamp, doublePrecision } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const machinesTable = pgTable("machines", {
  id: serial("id").primaryKey(),
  machineId: text("machine_id").notNull().unique(),
  siteId: text("site_id").notNull(),
  name: text("name").notNull(),
  machineType: text("machine_type").notNull(),
  // Current health state — updated by the health processor on every tick
  status: text("status").notNull().default("running"), // running | stopped | maintenance | offline
  severity: text("severity").notNull().default("normal"), // normal | warning | critical
  temperatureC: doublePrecision("temperature_c").notNull().default(65),
  pressurePsi: doublePrecision("pressure_psi").notNull().default(120),
  vibrationMmS: doublePrecision("vibration_mm_s").notNull().default(2.5),
  lastReadingAt: timestamp("last_reading_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertMachineSchema = createInsertSchema(machinesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertMachine = z.infer<typeof insertMachineSchema>;
export type Machine = typeof machinesTable.$inferSelect;

/**
 * Seeds initial sites and machines if the database is empty.
 * Also ensures the simulator_state row (id=1) exists.
 */
import { db } from "@workspace/db";
import { machinesTable, simulatorStateTable, sitesTable } from "@workspace/db";
import { logger } from "./logger";

const SITES = [
  { siteId: "plant-atlanta-01", name: "Atlanta Manufacturing Plant", location: "Atlanta, GA" },
  { siteId: "plant-chicago-02", name: "Chicago Processing Facility", location: "Chicago, IL" },
  { siteId: "plant-houston-03", name: "Houston Refinery Complex", location: "Houston, TX" },
];

const MACHINE_TEMPLATES: {
  type: string;
  prefix: string;
  count: number;
  baseTemp: number;
  basePsi: number;
  baseVib: number;
}[] = [
  { type: "compressor", prefix: "CMP", count: 4, baseTemp: 72, basePsi: 145, baseVib: 2.1 },
  { type: "pump", prefix: "PMP", count: 4, baseTemp: 58, basePsi: 110, baseVib: 1.8 },
  { type: "turbine", prefix: "TRB", count: 3, baseTemp: 85, basePsi: 180, baseVib: 3.2 },
  { type: "heat-exchanger", prefix: "HEX", count: 2, baseTemp: 95, basePsi: 90, baseVib: 0.9 },
  { type: "conveyor", prefix: "CNV", count: 2, baseTemp: 45, basePsi: 30, baseVib: 2.5 },
];

export async function seedIfEmpty() {
  try {
    // Ensure simulator state row exists
    const [existing] = await db.select().from(simulatorStateTable).limit(1);
    if (!existing) {
      await db.insert(simulatorStateTable).values({
        running: false,
        eventsPerSecond: 10,
        anomalyMode: "none",
        dlqEnabled: true,
        totalEventsGenerated: 0,
        totalEventsProcessed: 0,
        totalEventsDlq: 0,
      });
    }

    // Check if sites already seeded
    const [firstSite] = await db.select().from(sitesTable).limit(1);
    if (firstSite) return;

    logger.info("Seeding initial sites and machines...");

    // Insert sites
    await db.insert(sitesTable).values(SITES);

    // Insert machines for each site
    const machineRows: typeof machinesTable.$inferInsert[] = [];
    for (const site of SITES) {
      let idx = 1;
      for (const tmpl of MACHINE_TEMPLATES) {
        for (let n = 1; n <= tmpl.count; n++) {
          const num = String(idx++).padStart(3, "0");
          machineRows.push({
            machineId: `${tmpl.prefix}-${site.siteId.split("-")[1]?.toUpperCase()}-${num}`,
            siteId: site.siteId,
            name: `${tmpl.type.charAt(0).toUpperCase() + tmpl.type.slice(1)} ${num}`,
            machineType: tmpl.type,
            status: "running",
            severity: "normal",
            temperatureC: tmpl.baseTemp + Math.random() * 5,
            pressurePsi: tmpl.basePsi + Math.random() * 10,
            vibrationMmS: tmpl.baseVib + Math.random() * 0.5,
            lastReadingAt: new Date(),
          });
        }
      }
    }

    await db.insert(machinesTable).values(machineRows);
    logger.info({ machines: machineRows.length, sites: SITES.length }, "Seed complete");
  } catch (err) {
    logger.error({ err }, "Seed error");
  }
}

import app from "./app";
import { logger } from "./lib/logger";
import { seedIfEmpty } from "./lib/seed";
import { startSimulator, persistCounters } from "./lib/simulator";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function main() {
  // Seed the database (no-op if already seeded)
  await seedIfEmpty();

  // Start the equipment simulator background loop
  await startSimulator();

  // Sync counters to DB every 60 seconds
  setInterval(persistCounters, 60_000);

  // Graceful shutdown
  process.on("SIGTERM", async () => {
    logger.info("SIGTERM received, shutting down gracefully...");
    const { stopSimulator } = await import("./lib/simulator");
    await stopSimulator();
    process.exit(0);
  });

  process.on("SIGINT", async () => {
    const { stopSimulator } = await import("./lib/simulator");
    await stopSimulator();
    process.exit(0);
  });

  app.listen(port, (err?: Error) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }
    logger.info({ port }, "PlantPulse API server listening");
  });
}

main().catch((err) => {
  logger.error({ err }, "Fatal startup error");
  process.exit(1);
});

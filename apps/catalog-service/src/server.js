import { sequelize } from './config/database.js';
import { catalogRepository } from './repositories/catalog.repository.js';
import { createCatalogService } from './services/catalog.service.js';
import { createApp } from './app.js';

// Assemble the layers once during application startup.
const catalogService = createCatalogService(catalogRepository);
const app = createApp({ catalogService, sequelize });

// Read the HTTP port from the environment.
const port = Number(process.env.CATALOG_PORT ?? 3001);

try {
  // Verify database access before accepting HTTP traffic.
  await sequelize.authenticate();

  // Bind only to localhost during this unauthenticated learning phase.
  const server = app.listen(port, '127.0.0.1', () => {
    console.log(`Catalog Service listening on port ${port}`);
  });

  // Close the HTTP listener and database pool during shutdown.
  async function shutdown() {
    server.close(async () => {
      try {
        await sequelize.close();
        process.exit(0);
      } catch (error) {
        console.error('Shutdown failed:', error);
        process.exit(1);
      }
    });
  }

  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
} catch (error) {
  // A failed database connection must prevent the service from starting.
  console.error('Catalog Service startup failed:', error);
  await sequelize.close();
  process.exitCode = 1;
}

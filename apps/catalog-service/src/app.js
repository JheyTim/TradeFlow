import express from 'express';
import { createCatalogRouter } from './routes/catalog.routes.js';
import { errorHandler } from './middleware/error-handler.js';

// Keep Express application creation separate from server startup.
// This allows Supertest to test requests without opening a real port.
export function createApp({ catalogService, sequelize }) {
  const app = express();

  // Reject unusually large JSON bodies.
  app.use(express.json({ limit: '64kb' }));

  // Liveness only confirms that the application process responds.
  app.get('/health/live', (req, res) => {
    res.status(200).json({ status: 'alive' });
  });

  // Readiness confirms our required database is accessible.
  app.get('/health/ready', async (req, res) => {
    try {
      await sequelize.authenticate();
      return res.status(200).json({ status: 'ready' });
    } catch {
      return res.status(503).json({ status: 'not_ready' });
    }
  });

  // Register the Catalog Service's business endpoints.
  app.use(createCatalogRouter(catalogService));

  // Return a predictable response for unknown routes.
  app.use((req, res) => {
    res.status(404).json({
      error: { code: 'ROUTE_NOT_FOUND' },
    });
  });

  // Error-handling middleware must be registered last.
  app.use(errorHandler);

  return app;
}

import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { loadEnvFile } from 'node:process';

// Load the project's local database credentials for this integration test.
loadEnvFile('../../.env');

// Safety rule: integration tests must never use the development database.
process.env.CATALOG_DB_NAME = 'catalog_test';

// Import database modules only after choosing the isolated test database.
const { sequelize } = await import('../src/config/database.js');
const { catalogRepository } =
  await import('../src/repositories/catalog.repository.js');

beforeAll(async () => {
  // Fail early if the dedicated test database is unavailable.
  await sequelize.authenticate();
});

afterAll(async () => {
  // Release database connections after all tests complete.
  await sequelize.close();
});

describe('Inventory concurrency', () => {
  it('prevents two requests from reserving the final item', async () => {
    // Use a unique SKU so the test doesn't depend on existing records.
    const product = await catalogRepository.createProduct({
      sku: `TEST-${randomUUID()}`,
      name: 'Concurrency Test Product',
      price: '100.00',
      initialStock: 1,
    });

    // Send competing reservations at nearly the same time.
    const results = await Promise.allSettled([
      catalogRepository.reserveStock({
        productId: product.id,
        quantity: 1,
        requestKey: randomUUID(),
      }),
      catalogRepository.reserveStock({
        productId: product.id,
        quantity: 1,
        requestKey: randomUUID(),
      }),
    ]);

    // Exactly one transaction must commit successfully.
    const successful = results.filter(
      (result) => result.status === 'fulfilled',
    );

    const rejected = results.filter((result) => result.status === 'rejected');

    expect(successful).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason.code).toBe('INSUFFICIENT_STOCK');

    // The final stock must be zero, not negative.
    const updated = await catalogRepository.findById(product.id);
    expect(updated.availableStock).toBe(0);
  });
});

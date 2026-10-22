import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';

import { createProductSchema } from '../src/validation/catalog.schema.js';

import { createCatalogService } from '../src/services/catalog.service.js';

import { createApp } from '../src/app.js';

describe('Product validation', () => {
  // Valid product input should be accepted and normalized.
  it('accepts a valid product', () => {
    const result = createProductSchema.safeParse({
      sku: 'keyboard-001',
      name: 'Mechanical Keyboard',
      price: '2499.00',
      initialStock: 10,
    });

    expect(result.success).toBe(true);
    expect(result.data.sku).toBe('KEYBOARD-001');
  });

  // Prices cannot be negative.
  it('rejects negative prices', () => {
    const result = createProductSchema.safeParse({
      sku: 'KEYBOARD-001',
      name: 'Mechanical Keyboard',
      price: '-100.00',
      initialStock: 10,
    });

    expect(result.success).toBe(false);
  });

  // Stock quantities must be valid integers.
  it('rejects negative stock quantities', () => {
    const result = createProductSchema.safeParse({
      sku: 'KEYBOARD-001',
      name: 'Mechanical Keyboard',
      price: '2499.00',
      initialStock: -5,
    });

    expect(result.success).toBe(false);
  });
});

describe('Catalog business rules', () => {
  // A fake repository allows us to test without PostgreSQL.
  it('rejects duplicate SKUs', async () => {
    const fakeRepository = {
      findBySku: vi.fn().mockResolvedValue({
        id: 'existing-product',
      }),
      createProduct: vi.fn(),
    };

    const service = createCatalogService(fakeRepository);

    await expect(
      service.createProduct({
        sku: 'KEYBOARD-001',
        name: 'Mechanical Keyboard',
        price: '2499.00',
        initialStock: 10,
      }),
    ).rejects.toMatchObject({
      status: 409,
      code: 'SKU_ALREADY_EXISTS',
    });

    // Ensure duplicate products never reach the repository's write method.
    expect(fakeRepository.createProduct).not.toHaveBeenCalled();
  });
});

describe('Catalog HTTP API', () => {
  // Verify invalid API requests are stopped before reaching business logic.
  it('returns 400 and never saves an invalid product', async () => {
    const createProduct = vi.fn();

    // Supply only the mocked methods needed for this request.
    const app = createApp({
      catalogService: { createProduct },
      sequelize: { authenticate: vi.fn() },
    });

    const response = await request(app).post('/products').send({
      sku: 'KEYBOARD-001',
      name: 'Mechanical Keyboard',
      price: '-100.00',
      initialStock: -5,
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');

    // The API must not attempt any database write.
    expect(createProduct).not.toHaveBeenCalled();
  });
});

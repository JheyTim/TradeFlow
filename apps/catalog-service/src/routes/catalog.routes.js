import { Router } from 'express';
import {
  createProductSchema,
  updateProductSchema,
  listProductSchema,
  productIdSchema,
  reserveStockSchema,
} from '../validation/catalog.schema.js';
import { AppError } from '../middleware/error-handler.js';

// Parse request input and convert Zod errors to API-friendly errors.
function validate(schema, value) {
  const result = schema.safeParse(value);

  if (!result.success) {
    throw new AppError(400, 'VALIDATION_ERROR', result.error.issues);
  }

  return result.data;
}

// Build a router using the provided service implementation.
export function createCatalogRouter(service) {
  const router = Router();

  // POST /products: create a product and its inventory record.
  router.post('/products', async (req, res) => {
    const data = validate(createProductSchema, req.body);
    const product = await service.createProduct(data);

    return res.status(201).json({ data: product });
  });

  // GET /products: return paginated, searchable products.
  router.get('/products', async (req, res) => {
    const query = validate(listProductSchema, req.query);
    const result = await service.listProducts(query);

    return res.status(200).json(result);
  });

  // GET /products/:id: return details for an active product.
  router.get('/products/:id', async (req, res) => {
    const id = validate(productIdSchema, req.params.id);
    const product = await service.getProduct(id);

    return res.status(200).json({ data: product });
  });

  // PATCH /products/:id: update allowed product attributes.
  router.patch('/products/:id', async (req, res) => {
    const id = validate(productIdSchema, req.params.id);
    const changes = validate(updateProductSchema, req.body);
    const product = await service.updateProduct(id, changes);

    return res.status(200).json({ data: product });
  });

  // POST /inventory/reservations: reserve inventory internally.
  router.post('/inventory/reservations', async (req, res) => {
    const data = validate(reserveStockSchema, req.body);

    // Require a stable UUID for deduplicating repeated requests.
    const requestKey = validate(productIdSchema, req.get('Idempotency-Key'));

    const result = await service.reserveStock({
      ...data,
      requestKey,
    });

    // Replayed requests return 200; newly created reservations return 201.
    return res.status(result.created ? 201 : 200).json({
      data: result.reservation,
    });
  });

  return router;
}

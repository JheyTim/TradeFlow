import { AppError } from '../middleware/error-handler.js';

// Inject a repository to make business logic easy to unit test.
export function createCatalogService(repository) {
  return {
    // Prevent duplicate SKUs and delegate persistence to the repository.
    async createProduct(data) {
      const existing = await repository.findBySku(data.sku);

      if (existing) {
        throw new AppError(409, 'SKU_ALREADY_EXISTS');
      }

      // PostgreSQL's unique constraint still protects against races.
      return repository.createProduct(data);
    },

    // Return only active products in the public-facing catalog.
    async getProduct(id) {
      const product = await repository.findById(id);

      if (!product || !product.isActive) {
        throw new AppError(404, 'PRODUCT_NOT_FOUND');
      }

      return product;
    },

    // Apply the requested pagination and search settings.
    async listProducts(query) {
      return repository.listProducts(query);
    },

    // The repository returns null if the product doesn't exist.
    async updateProduct(id, changes) {
      const product = await repository.updateProduct(id, changes);

      if (!product) {
        throw new AppError(404, 'PRODUCT_NOT_FOUND');
      }

      return product;
    },

    // Stock reservation will be added in Milestone 4.
    async reserveStock(data) {
      return repository.reserveStock(data);
    },
  };
}

import { Op } from 'sequelize';
import { sequelize } from '../config/database.js';
import { Product, Inventory, Reservation } from '../models/index.js';
import { AppError } from '../middleware/error-handler.js';

// Convert database models into the product shape exposed by the API.
// Do not leak the internal reserved stock counter as editable product data.
function presentProduct(product) {
  const data = product.get({ plain: true });

  return {
    id: data.id,
    sku: data.sku,
    name: data.name,
    description: data.description,
    price: data.price,
    currency: 'USD',
    isActive: data.isActive,
    availableStock: data.inventory.onHand - data.inventory.reserved,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}

// Reuse this association when retrieving products.
const withInventory = [
  {
    model: Inventory,
    as: 'inventory',
    attributes: ['onHand', 'reserved'],
  },
];

export const catalogRepository = {
  // Look up an SKU before creating a new product.
  async findBySku(sku) {
    return Product.findOne({ where: { sku } });
  },

  // Product creation and initial inventory must succeed together.
  async createProduct(data) {
    return sequelize.transaction(async (transaction) => {
      const product = await Product.create(
        {
          sku: data.sku,
          name: data.name,
          description: data.description ?? null,
          price: data.price,
        },
        { transaction },
      );

      await Inventory.create(
        {
          productId: product.id,
          onHand: data.initialStock,
          reserved: 0,
        },
        { transaction },
      );

      const created = await Product.findByPk(product.id, {
        include: withInventory,
        transaction,
      });

      return presentProduct(created);
    });
  },

  // Retrieve a single product with its stock balance.
  async findById(id) {
    const product = await Product.findByPk(id, {
      include: withInventory,
    });

    return product ? presentProduct(product) : null;
  },

  // Only active products appear in public product listings.
  async listProducts({ page, limit, search }) {
    const where = { isActive: true };

    // ILIKE provides case-insensitive text search in PostgreSQL.
    if (search) {
      where.name = { [Op.iLike]: `%${search}%` };
    }

    // Offset pagination is sufficient for our initial catalog.
    const { rows, count } = await Product.findAndCountAll({
      where,
      include: withInventory,
      order: [
        ['name', 'ASC'],
        ['id', 'ASC'],
      ],
      limit,
      offset: (page - 1) * limit,
    });

    return {
      data: rows.map(presentProduct),
      paginaion: {
        page,
        limit,
        total: count,
        totalPages: Math.ceil(count / limit),
      },
    };
  },

  // Update only fields accepted by the validation schema.
  async updateProduct(id, changes) {
    const product = await Product.findByPk(id);

    if (!product) {
      return null;
    }

    await product.update(changes);

    return this.findById(id);
  },

  // Reserve inventory as one atomic database operation.
  async reserveStock({ productId, quantity, requestKey }) {
    return sequelize.transaction(async (transaction) => {
      // Return the existing reservation for a repeated request key.
      // This prevents retrying a completed reservation.
      const existing = await Reservation.findOne({
        where: { requestKey },
        transaction,
      });

      if (existing) {
        // An idempotency key cannot represent two different operations.
        if (
          existing.productId !== productId ||
          existing.quantity !== quantity
        ) {
          throw new AppError(409, 'IDEMPOTENCY_KEY_CONFLICT');
        }

        return {
          reservation: existing.get({ plain: true }),
          created: false,
        };
      }

      // Lock the inventory row until this transaction commits.
      // Competing reservations for the same product must wait.
      const inventory = await Inventory.findByPk(productId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (!inventory) {
        throw new AppError(404, 'PRODUCT_NOT_FOUND');
      }

      // Confirm the product can still be purchased.
      const product = await Product.findByPk(productId, {
        transaction,
      });

      if (!product.isActive) {
        throw new AppError(409, 'PRODUCT_INACTIVE');
      }

      // Check the idempotency key again after waiting for the row lock.
      // Another request may have committed while we were waiting.
      const afterLock = await Reservation.findOne({
        where: { requestKey },
        transaction,
      });

      if (afterLock) {
        if (
          afterLock.productId !== productId ||
          afterLock.quantity !== quantity
        ) {
          throw new AppError(409, 'IDEMPOTENCY_KEY_CONFLICT');
        }

        return {
          reservation: afterLock.get({ plain: true }),
          created: false,
        };
      }

      // Calculate the remaining sellable stock.
      const available = inventory.onHand - inventory.reserved;

      if (available < quantity) {
        throw new AppError(409, 'INSUFFICIENT_STOCK');
      }

      // Increase reserved stock without changing the physical quantity.
      await inventory.update(
        {
          reserved: inventory.reserved + quantity,
        },
        { transaction },
      );

      // Record the reservation in the same transaction.
      const reservation = await Reservation.create(
        {
          productId,
          requestKey,
          quantity,
          status: 'ACTIVE',
        },
        { transaction },
      );

      // Commit both changes together, or roll back both on failure.
      return {
        reservation: reservation.get({ plain: true }),
        created: true,
      };
    });
  },
};

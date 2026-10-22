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

  // The stock reservation implementation follows in Milestone 4.
};

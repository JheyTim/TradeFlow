import { DataTypes, Sequelize } from 'sequelize';

// Apply the new schema inside one PostgreSQL transaction.
// If any operation fails, PostgreSQL rolls back the schema changes.
export async function up({ context: qi }) {
  await qi.sequelize.transaction(async (transaction) => {
    // Store products and their business-facing attributes.
    await qi.createTable(
      'products',
      {
        id: {
          type: DataTypes.UUID,
          primaryKey: true,
          defaultValue: Sequelize.literal('gen_random_uuid()'),
        },
        sku: {
          type: DataTypes.STRING(50),
          allowNull: false,
          unique: true,
        },
        name: {
          type: DataTypes.STRING(150),
          allowNull: false,
        },
        description: {
          type: DataTypes.TEXT,
          allowNull: true,
        },
        price: {
          // NUMERIC is preferable to floating point for stored prices.
          type: DataTypes.DECIMAL(12, 2),
          allowNull: false,
        },
        is_active: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: true,
        },
        created_at: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        },
        updated_at: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        },
      },
      { transaction },
    );

    // Enforce pricing integrity even if an application has a bug.
    await qi.sequelize.query(
      'ALTER TABLE products ADD CONSTRAINT products_price_positive CHECK (price > 0)',
      { transaction },
    );

    // Inventory is controlled independently from product information.
    await qi.createTable(
      'inventories',
      {
        product_id: {
          type: DataTypes.UUID,
          primaryKey: true,
          references: { model: 'products', key: 'id' },
          onDelete: 'RESTRICT',
        },
        on_hand: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        reserved: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
      },
      { transaction },
    );

    // Stock cannot be negative, and reservations cannot exceed stock.
    await qi.sequelize.query(
      `ALTER TABLE inventories
       ADD CONSTRAINT inventories_valid_stock
       CHECK (on_hand >= 0 AND reserved >= 0 AND reserved <= on_hand)`,
      { transaction },
    );

    // Keep an audit record of each successful inventory reservation.
    await qi.createTable(
      'reservations',
      {
        id: {
          type: DataTypes.UUID,
          primaryKey: true,
          defaultValue: Sequelize.literal('gen_random_uuid()'),
        },
        product_id: {
          type: DataTypes.UUID,
          allowNull: false,
          references: { model: 'products', key: 'id' },
          onDelete: 'RESTRICT',
        },
        request_key: {
          type: DataTypes.STRING(128),
          allowNull: false,
          unique: true,
        },
        quantity: {
          type: DataTypes.INTEGER,
          allowNull: false,
        },
        status: {
          type: DataTypes.STRING(20),
          allowNull: false,
          defaultValue: 'ACTIVE',
        },
        created_at: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        },
        updated_at: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        },
      },
      { transaction },
    );

    // Keep invalid reservation quantities out of the database.
    await qi.sequelize.query(
      'ALTER TABLE reservations ADD CONSTRAINT reservations_positive_quantity CHECK (quantity > 0)',
      { transaction },
    );

    // Improve the common query for active product browsing.
    await qi.addIndex('products', ['is_active', 'name'], {
      name: 'products_active_name_idx',
      transaction,
    });

    // Improve searches for reservations belonging to one product.
    await qi.addIndex('reservations', ['product_id'], {
      name: 'reservations_product_idx',
      transaction,
    });
  });
}

// Revert the schema when explicitly rolling back this migration.
// Child tables are dropped first because they reference products.
export async function down({ context: qi }) {
  await qi.sequelize.transaction(async (transaction) => {
    await qi.dropTable('reservations', { transaction });
    await qi.dropTable('inventories', { transaction });
    await qi.dropTable('products', { transaction });
  });
}

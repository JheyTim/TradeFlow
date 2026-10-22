import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';

// Products contain catalog information, not mutable stock balances.
export class Product extends Model {}

Product.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
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
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    sequelize,
    tableName: 'products',
    underscored: true,
    timestamps: true,
  },
);

// Inventory contains the physical and reserved stock counts.
export class Inventory extends Model {}

Inventory.init(
  {
    productId: {
      type: DataTypes.UUID,
      primaryKey: true,
    },
    onHand: {
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
  {
    sequelize,
    tableName: 'inventories',
    underscored: true,
    timestamps: false,
  },
);

// Reservations let us track stock allocations and retry requests safely.
export class Reservation extends Model {}

Reservation.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    productId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    requestKey: {
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
  },
  {
    sequelize,
    tableName: 'reservations',
    underscored: true,
    timestamps: true,
  },
);

// A product has exactly one inventory row in our business model.
Product.hasOne(Inventory, {
  foreignKey: 'productId',
  as: 'inventory',
});

Inventory.belongsTo(Product, {
  foreignKey: 'productId',
});

// One product can have multiple reservation records.
Product.hasMany(Reservation, {
  foreignKey: 'productId',
});

Reservation.belongsTo(Product, {
  foreignKey: 'productId',
});

import { Sequelize } from 'sequelize';

// Fail during startup if essential database settings are missing.
// Silent defaults for credentials could connect us to the wrong database.
const required = ['CATALOG_DB_NAME', 'CATALOG_DB_USER', 'CATALOG_DB_PASSWORD'];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing environment variable: ${key}`);
  }
}

// Create a connection pool for this microservice.
// Sequelize will reuse connections instead of opening a new one per request.
export const sequelize = new Sequelize(
  process.env.CATALOG_DB_NAME,
  process.env.CATALOG_DB_USER,
  process.env.CATALOG_DB_PASSWORD,
  {
    dialect: 'postgres',
    host: process.env.CATALOG_DB_HOST ?? '127.0.0.1',
    port: Number(process.env.CATALOG_DB_PORT ?? 5432),

    // Keep SQL logging disabled initially.
    // We can enable sanitized query logging when debugging.
    logging: false,

    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000,
    },
  },
);

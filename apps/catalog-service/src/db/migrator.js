import path from 'node:path';
import { Umzug, SequelizeStorage } from 'umzug';
import { sequelize } from '../config/database.js';

// Discover JavaScript migrations in this directory.
const migrationsPath = path
  .join(import.meta.dirname, 'migrations', '*.js')
  .replace(/\\/g, '/');

// Umzug finds migration files and tracks which have already run.
const migrator = new Umzug({
  migrations: {
    glob: migrationsPath,
  },

  // Give migration functions access to Sequelize's schema interface.
  context: sequelize.getQueryInterface(),

  // Track applied migrations in PostgreSQL's SequelizeMeta table.
  storage: new SequelizeStorage({ sequelize }),

  // Print migration activity while developing locally.
  logger: console,
});

// Support commands such as "up", "down", and "pending".
try {
  await migrator.runAsCLI();
} finally {
  // Release the database connections after the command finishes.
  await sequelize.close();
}

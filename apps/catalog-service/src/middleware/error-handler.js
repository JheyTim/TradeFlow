import { UniqueConstraintError } from 'sequelize';

// Represent expected business and HTTP errors consistently.
export class AppError extends Error {
  constructor(status, code, details = undefined) {
    super(code);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// Express identifies error middleware by its four parameters.
export function errorHandler(error, req, res, next) {
  // Delegate to Express if a response has already started.
  if (res.headersSent) {
    return next(error);
  }

  // Handle expected business errors.
  if (error instanceof AppError) {
    return res.status(error.status).json({
      error: {
        code: error.code,
        details: error.details,
      },
    });
  }

  // Database uniqueness remains authoritative during concurrent writes.
  if (error instanceof UniqueConstraintError) {
    return res.status(409).json({
      error: { code: 'UNIQUE_CONSTRAINT_VIOLATION' },
    });
  }

  // Never return SQL messages or internal stack traces to API clients.
  console.error('Unexpected Catalog Service error:', error);

  return res.status(500).json({
    error: { code: 'INTERNAL_SERVER_ERROR' },
  });
}

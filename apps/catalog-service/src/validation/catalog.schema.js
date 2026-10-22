import { z } from 'zod';

// Accept money as a decimal string instead of a floating-point number.
// The database will store it as NUMERIC(12, 2).
// This regex allows up to 10 digits before the decimal separator.
const priceSchema = z
  .string()
  .regex(/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/, {
    message: 'Price must be a decimal string with at most two decimal places',
  })
  .refine((value) => Number(value) > 0, {
    message: 'Price must be greater than zero',
  });

// Validate the request for creating a product.
// strict() rejects unexpected fields such as reserved or id.
export const createProductSchema = z
  .object({
    sku: z
      .string()
      .trim()
      .min(3)
      .max(50)
      .regex(/^[a-zA-Z0-9_-]+$/)
      .transform((value) => value.toUpperCase()),

    name: z.string().trim().min(2).max(150),
    description: z.string().trim().max(2000).nullable().optional(),
    price: priceSchema,

    // Stock quantities must be safe, nonnegative integers.
    initialStock: z.number().int().min(0).max(2147483647),
  })
  .strict();

// Only explicitly editable fields are allowed during updates.
export const updateProductSchema = z
  .object({
    name: z.string().trim().min(2).max(150).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    price: priceSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

// Parse and bound pagination input.
export const listProductSchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().max(100).optional(),
  })
  .strict();

// Validate a UUID used in an API route.
export const productIdSchema = z.uuid();

// Reserve only positive integer quantities.
export const reserveStockSchema = z
  .object({
    productId: z.uuid(),
    quantity: z.number().int().min(1).max(2147483647),
  })
  .strict();

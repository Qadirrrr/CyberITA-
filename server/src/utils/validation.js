import { z } from 'zod';

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 72;

/** Shared password rules: 8-72 chars, at least one letter and one number. */
export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, 'Password must be at least 8 characters.')
  .max(PASSWORD_MAX_LENGTH, 'Password must be at most 72 characters.')
  .regex(/[A-Za-z]/, 'Password must contain a letter.')
  .regex(/[0-9]/, 'Password must contain a number.');

export const emailSchema = z.string().trim().email('Enter a valid email address.').max(255);

export const fullNameSchema = z
  .string()
  .trim()
  .min(2, 'Name must be at least 2 characters.')
  .max(120, 'Name must be at most 120 characters.');

export const optionalHttpUrl = z
  .string()
  .trim()
  .max(500, 'URL is too long.')
  .nullable()
  .optional()
  .transform((value) => (value === '' ? null : value))
  .refine((value) => {
    if (value == null) return true;
    try {
      const parsed = new URL(value);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }, 'Enter a valid http(s) URL.');

import { badRequest } from '../utils/errors.js';

/** Validates req.body against a zod schema; throws 400 with details on failure. */
export function validateBody(schema) {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }));
      return next(badRequest('Validation failed.', details));
    }
    req.validatedBody = result.data;
    req.body = result.data;
    next();
  };
}

/** Validates req.params against a zod schema. */
export function validateParams(schema) {
  return (req, _res, next) => {
    const result = schema.safeParse(req.params ?? {});
    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }));
      return next(badRequest('Invalid path parameters.', details));
    }
    next();
  };
}

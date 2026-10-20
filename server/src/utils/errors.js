/** Application error with an HTTP status and a machine readable code. */
export class AppError extends Error {
  constructor(message, status = 500, code = 'error', details = undefined) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
    this.expose = status < 500;
  }
}

export const badRequest = (message, details) => new AppError(message, 400, 'bad_request', details);
export const unauthorized = (message = 'Authentication required.') => new AppError(message, 401, 'unauthorized');
export const forbidden = (message = 'You do not have permission to perform this action.') =>
  new AppError(message, 403, 'forbidden');
export const notFound = (message = 'Resource not found.') => new AppError(message, 404, 'not_found');
export const conflict = (message, details) => new AppError(message, 409, 'conflict', details);
export const tooMany = (message = 'Too many requests.') => new AppError(message, 429, 'rate_limited');
export const serverError = (message = 'Internal server error.') => new AppError(message, 500, 'server_error');

export function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

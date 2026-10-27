import env from '../config/env.js';
import logger from '../config/logger.js';
import { AppError } from '../utils/errors.js';

export function notFoundHandler(req, _res, next) {
  next(new AppError(`Route not found: ${req.method} ${req.originalUrl}`, 404, 'not_found'));
}

const UNAVAILABLE_CODES = new Set(['53100', '53200', '53300', '57P03', '08000', '08001', '08003', '08004', '08006', 'ENOSPC']);

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  const unavailable = UNAVAILABLE_CODES.has(String(err.code || ''));
  const status = err.status || err.statusCode || (unavailable ? 503 : 500);
  const code = unavailable ? 'service_unavailable' : err.code || 'server_error';
  const payload = {
    error: {
      message: unavailable
        ? 'Service temporarily unavailable. Please try again shortly.'
        : err.expose || status < 500
          ? err.message
          : 'Internal server error.',
      code,
      ...(err.details ? { details: err.details } : {}),
    },
  };

  if (status >= 500) {
    logger.error('Request failed', {
      method: req.method,
      path: req.originalUrl,
      message: err.message,
      stack: env.isProduction ? undefined : err.stack,
    });
  }
  res.status(status).json(payload);
}

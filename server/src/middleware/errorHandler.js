import env from '../config/env.js';
import logger from '../config/logger.js';
import { AppError } from '../utils/errors.js';

export function notFoundHandler(req, _res, next) {
  next(new AppError(`Route not found: ${req.method} ${req.originalUrl}`, 404, 'not_found'));
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  const status = err.status || err.statusCode || 500;
  const code = err.code || 'server_error';
  const payload = {
    error: {
      message: err.expose || status < 500 ? err.message : 'Internal server error.',
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

export class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', details = undefined) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

export function assertFound(resource, message = 'Resource not found') {
  if (!resource) {
    throw new AppError(message, 404, 'NOT_FOUND');
  }
  return resource;
}

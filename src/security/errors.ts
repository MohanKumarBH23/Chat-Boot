/**
 * Typed application error hierarchy for consistent API & service error handling.
 */

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly expose: boolean;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    expose = true,
    cause?: unknown
  ) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.code = code;
    this.expose = expose;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, code = 'VALIDATION_ERROR') {
    super(400, code, message, true);
  }
}

export class AuthenticationError extends AppError {
  constructor(message = 'Authentication required', code = 'AUTHENTICATION_REQUIRED') {
    super(401, code, message, true);
  }
}

export class AuthorizationError extends AppError {
  constructor(message = 'Forbidden', code = 'FORBIDDEN') {
    super(403, code, message, true);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found', code = 'NOT_FOUND') {
    super(404, code, message, true);
  }
}

export class MethodNotAllowedError extends AppError {
  public readonly allowedMethods: string[];

  constructor(allowedMethods: string[]) {
    super(405, 'METHOD_NOT_ALLOWED', 'Method not allowed', true);
    this.allowedMethods = allowedMethods;
  }
}

export class ConflictError extends AppError {
  constructor(message: string, code = 'CONFLICT') {
    super(409, code, message, true);
  }
}

export class PayloadTooLargeError extends AppError {
  constructor(message = 'Request body too large') {
    super(413, 'PAYLOAD_TOO_LARGE', message, true);
  }
}

export class UnsupportedMediaTypeError extends AppError {
  constructor(message = 'Content-Type must be application/json') {
    super(415, 'UNSUPPORTED_MEDIA_TYPE', message, true);
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Too many requests. Please try again later.') {
    super(429, 'RATE_LIMIT_EXCEEDED', message, true);
  }
}

export class UpstreamServiceError extends AppError {
  constructor(message: string, cause?: unknown) {
    super(502, 'UPSTREAM_ERROR', message, false, cause);
  }
}

export class ConfigurationError extends AppError {
  constructor(message: string, cause?: unknown) {
    super(500, 'CONFIGURATION_ERROR', message, false, cause);
  }
}


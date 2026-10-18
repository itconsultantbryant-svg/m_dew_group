export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;
  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }

  static badRequest = (code: string, message: string, details?: unknown) => new AppError(400, code, message, details);
  static unauthorized = (message = 'Authentication required.') => new AppError(401, 'UNAUTHORIZED', message);
  static forbidden = (message = 'You do not have permission to perform this action.') => new AppError(403, 'FORBIDDEN', message);
  static notFound = (message = 'Resource not found.') => new AppError(404, 'NOT_FOUND', message);
  static conflict = (code: string, message: string, details?: unknown) => new AppError(409, code, message, details);
  static gone = (code: string, message: string) => new AppError(410, code, message);
  static unprocessable = (code: string, message: string, details?: unknown) => new AppError(422, code, message, details);
  static tooMany = (message = 'Too many requests. Please try again shortly.') => new AppError(429, 'RATE_LIMITED', message);
  static unavailable = (code: string, message: string, details?: unknown) => new AppError(503, code, message, details);
}

export const Errors = {
  badRequest: (code: string, message: string, details?: unknown) => new AppError(400, code, message, details),
  unauthorized: (message = 'Authentication required.') => new AppError(401, 'UNAUTHORIZED', message),
  forbidden: (message = 'You do not have permission to perform this action.') => new AppError(403, 'FORBIDDEN', message),
  notFound: (message = 'Resource not found.') => new AppError(404, 'NOT_FOUND', message),
  conflict: (code: string, message: string, details?: unknown) => new AppError(409, code, message, details),
  gone: (code: string, message: string) => new AppError(410, code, message),
  unprocessable: (code: string, message: string, details?: unknown) => new AppError(422, code, message, details),
  tooMany: (message = 'Too many requests. Please try again shortly.') => new AppError(429, 'RATE_LIMITED', message),
  unavailable: (code: string, message: string, details?: unknown) => new AppError(503, code, message, details),
} as const;

export interface ErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId?: string;
  };
}

export function toErrorBody(err: unknown, requestId?: string): { statusCode: number; body: ErrorBody } {
  if (err instanceof AppError) {
    return {
      statusCode: err.statusCode,
      body: { error: { code: err.code, message: err.message, details: err.details, requestId } },
    };
  }
  return {
    statusCode: 500,
    body: { error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.', requestId } },
  };
}

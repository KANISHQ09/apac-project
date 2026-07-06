export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string = "APP_ERROR",
    public readonly originalError?: unknown
  ) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class APIError extends AppError {
  constructor(
    message: string,
    public readonly statusCode?: number,
    originalError?: unknown
  ) {
    super(message, "API_ERROR", originalError);
  }
}

export class ValidationError extends AppError {
  constructor(
    message: string,
    public readonly fields?: Record<string, string>,
    originalError?: unknown
  ) {
    super(message, "VALIDATION_ERROR", originalError);
  }
}

export class AuthError extends AppError {
  constructor(message: string, originalError?: unknown) {
    super(message, "AUTH_ERROR", originalError);
  }
}

export class StorageError extends AppError {
  constructor(message: string, originalError?: unknown) {
    super(message, "STORAGE_ERROR", originalError);
  }
}

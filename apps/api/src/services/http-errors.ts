export class RequestError extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 404 | 409 | 413 | 415 | 422 | 429,
    readonly code: string,
    readonly publicMessage: string,
  ) {
    super(publicMessage);
    this.name = 'RequestError';
  }
}

export class RequestError extends Error {
  constructor(
    readonly status: 400 | 401 | 413 | 415 | 429,
    readonly code: string,
    readonly publicMessage: string,
  ) {
    super(publicMessage);
    this.name = 'RequestError';
  }
}

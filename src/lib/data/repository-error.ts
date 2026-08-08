export class RepositoryError extends Error {
  constructor(message: string, public readonly causeMessage?: string) {
    super(message);
    this.name = "RepositoryError";
  }
}
export function toRepositoryError(error: { message?: string } | null, fallback: string) {
  return new RepositoryError(fallback, error?.message);
}

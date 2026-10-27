export type LibraryErrorCode = "invalid-input" | "not-found" | "duplicate-name";

export class LibraryError extends Error {
  constructor(readonly code: LibraryErrorCode, message: string) {
    super(message);
    this.name = "LibraryError";
  }
}

export function friendlyError(error: unknown, fallback = "Something went wrong."): string {
  if (error instanceof LibraryError) return error.message;
  const name = (error as { name?: unknown } | null)?.name;
  if (name === "QuotaExceededError") {
    return "Browser storage for ContextLens is full. Export a backup, then delete items you no longer need.";
  }
  if (name === "InvalidStateError" || name === "SecurityError" || name === "UnknownError") {
    return "Browser storage is unavailable right now. Close other ContextLens tabs and try again.";
  }
  return fallback;
}

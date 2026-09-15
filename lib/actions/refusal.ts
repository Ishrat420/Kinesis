/**
 * A refusal is something the person can act on. A fault is not.
 *
 * Next.js redacts a thrown error's message before it reaches the browser, so a
 * `throw new Error("Select an object for every Kinesis Link field")` reads as
 * "An unexpected error occurred" and a digest hash in production -- a sentence
 * written for the owner, delivered to nobody. The framework's own guidance is to
 * model expected errors as return values rather than throw them, and every form
 * action here already returns a `{ error?: string }` state its form renders.
 *
 * Most refusals should therefore just be returned. This exists for the ones
 * raised deep inside a `$transaction` callback, where returning would commit the
 * write the refusal is meant to prevent: throw an `ActionRefusal`, let the
 * transaction roll back, and turn it into the returned message at the edge.
 *
 * Nothing here catches broadly enough to swallow `redirect()` or `notFound()`,
 * which work by throwing their own control-flow errors: `refusalOf` reports that
 * it does not recognise anything else, and callers rethrow.
 */
export class ActionRefusal extends Error {
  /** Set on a refusal raised over a stale `updatedAt` (BUG-007), so the action layer can report it distinctly from an ordinary refusal -- "someone else changed this" needs a different message and UI than "this no longer exists." */
  readonly conflict: boolean;

  constructor(message: string, options?: { conflict?: boolean }) {
    super(message);
    this.name = "ActionRefusal";
    this.conflict = options?.conflict ?? false;
  }
}

/** Raises a refusal from inside a transaction, rolling it back on the way out. */
export function refuse(message: string): never {
  throw new ActionRefusal(message);
}

/** Raises a refusal over a lost update -- a version-conditioned write matched zero rows because the record changed since it was read, not because it was deleted. See `refuse` for the general case. */
export function refuseConflict(message: string): never {
  throw new ActionRefusal(message, { conflict: true });
}

/**
 * The message to return for a caught error, or null if it is not a refusal.
 *
 * A null answer means the caller is holding something it does not understand --
 * a real fault, or one of Next.js's control-flow errors -- and must rethrow it
 * rather than report it as a refusal.
 */
export function refusalOf(error: unknown): string | null {
  return error instanceof ActionRefusal ? error.message : null;
}

/** Whether a caught error is specifically a lost-update conflict raised by `refuseConflict`, so the action layer can flag it for the form instead of just returning its message. */
export function isConflictRefusal(error: unknown): boolean {
  return error instanceof ActionRefusal && error.conflict;
}

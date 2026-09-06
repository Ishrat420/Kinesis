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
  constructor(message: string) {
    super(message);
    this.name = "ActionRefusal";
  }
}

/** Raises a refusal from inside a transaction, rolling it back on the way out. */
export function refuse(message: string): never {
  throw new ActionRefusal(message);
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

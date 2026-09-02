/**
 * The three ways of looking at captures (KD-008C / KD-011).
 *
 * "Standalone" and "Connected" are the question ADR-009 cares about: has this
 * action been tied to something Kinesis understands yet, or is it still just a
 * note to self? A capture starts standalone by design, and moving it across is
 * the "organise later" half of the promise.
 *
 * This lives in lib/ rather than beside the board that renders it because the
 * server reads the scope out of the URL and the client renders the filters, and
 * a "use client" module cannot supply a value to a Server Component: its exports
 * become client references, and calling one on the server throws at request
 * time. Domain vocabulary belongs here with the statuses regardless.
 */
export const TODO_SCOPES = [
  { value: "all", label: "All" },
  { value: "standalone", label: "Standalone" },
  { value: "connected", label: "Connected" },
] as const;

export type TodoScope = (typeof TODO_SCOPES)[number]["value"];

export const DEFAULT_TODO_SCOPE: TodoScope = "all";

/** Narrows a scope read from the query string; anything unrecognised is not one. */
export const isTodoScope = (value: unknown): value is TodoScope =>
  TODO_SCOPES.some((scope) => scope.value === value);

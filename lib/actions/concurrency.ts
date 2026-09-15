/**
 * The freshest of two `updatedAt` stamps a form has seen: the one the page
 * loaded with, and (once a save has gone through) the one that save's own
 * action state returned. Needed because `router.refresh()`'s post-action
 * prop refresh does not land synchronously with the save completing (BUG-007)
 * -- a form resubmitting the page's original prop, rather than its own most
 * recent save, would refuse its very next save as a conflict against itself.
 *
 * ISO-8601 strings sort lexically in chronological order, so a plain string
 * compare is enough; no Date parsing needed. `candidate` is only ever a
 * value this same save round-tripped from the server, so it's trusted as-is.
 */
export function freshestStamp(propStamp: string, candidate: string | undefined): string {
  return candidate && candidate > propStamp ? candidate : propStamp;
}

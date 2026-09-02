import { CAPTURE_DETAIL_PARAMS, CAPTURE_SOURCE_PARAM, CAPTURE_TITLE_PARAM } from "./targets";

/**
 * What a module's create surface reads when quick capture sent someone to it.
 *
 * A capture arrives as query parameters, which are user-supplied strings like
 * any other. Reading them in one place means every module treats a repeated or
 * absent parameter the same way, and none of them has to remember the parameter
 * names -- those live with the registry that writes them.
 */
export type CaptureParams = { title: string; from?: string; dueDate?: string };

const single = (value: string | string[] | undefined) => {
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === "string" ? first.trim() : "";
};

/** Returns undefined when the page was not opened by a capture at all. */
export function readCaptureParams(searchParams: Record<string, string | string[] | undefined>): CaptureParams | undefined {
  const title = single(searchParams[CAPTURE_TITLE_PARAM]);
  if (!title) return undefined;

  const from = single(searchParams[CAPTURE_SOURCE_PARAM]);
  const dueDate = single(searchParams[CAPTURE_DETAIL_PARAMS.dueDate]);
  return { title, ...(from ? { from } : {}), ...(dueDate ? { dueDate } : {}) };
}

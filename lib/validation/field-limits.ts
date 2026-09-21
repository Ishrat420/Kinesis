/**
 * KD-043 -- the one shared vocabulary every free-text/numeric field's length
 * or range limit is drawn from, keyed by kind rather than by individual
 * field: a `status`/`category`/`type` string and a `notes` field want very
 * different limits, and picking one number for everything would either be
 * too tight for notes or too loose for everything else.
 *
 * These are app-level limits, enforced here and mirrored as a client
 * `maxLength` hint on the corresponding input -- a `CHECK ... NOT VALID`
 * constraint at the database level is a separate, later decision (KD-043's
 * own "Open questions"), not something this module needs to know about.
 */

/** Traditional single-line default -- names, categories, types, statuses. */
export const TEXT_LIMIT = 255;
/** Multi-line free text -- ~1,500-2,000 words. */
export const NOTES_LIMIT = 10_000;
/** Comfortably covers a pre-signed cloud-storage share link (S3, Google Cloud Storage), which routinely runs past 1,000 characters. */
export const LINK_LIMIT = 2_000;
/**
 * Sits under JavaScript's safe-integer ceiling (2^53 ≈ 9.007 quadrillion) so
 * a value this large can never silently lose float precision; six decimal
 * places covers currency/percent without inviting meaningless precision.
 */
export const NUMBER_MAGNITUDE_LIMIT = 9_999_999_999_999.999999;

/** A trimmed string over `limit` characters is refused; empty/absent is always fine -- required-ness is each caller's own, separate rule. */
export function checkLength(value: string | null | undefined, limit: number, label: string): string | null {
  if (value && value.length > limit) return `Keep ${label} under ${limit.toLocaleString()} characters.`;
  return null;
}

/** A finite number whose magnitude exceeds the limit is refused; `null`/`undefined`/non-finite are each caller's own, separate concern (required-ness, NaN handling). */
export function checkNumberMagnitude(value: number | null | undefined, label: string): string | null {
  if (value !== null && value !== undefined && Number.isFinite(value) && Math.abs(value) > NUMBER_MAGNITUDE_LIMIT) {
    return `Keep ${label} under ${NUMBER_MAGNITUDE_LIMIT.toLocaleString()}.`;
  }
  return null;
}

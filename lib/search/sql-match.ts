import { Prisma } from "@prisma/client";

/**
 * `unaccent(lower(expr)) LIKE unaccent(lower('%term%'))`, for one hardcoded
 * SQL expression (a column, or a related row's column inside an `EXISTS`
 * subquery) against one search term.
 *
 * `expr` must always be a literal string written in this codebase -- never
 * derived from user input -- since it goes through `Prisma.raw` unescaped.
 * `term` is safely parameterized through the tagged template.
 *
 * This only narrows which rows a provider fetches before `rankSearchEntries`
 * makes the real, exact decision over the (much smaller) result. Generous is
 * safe here: an extra candidate is simply filtered out downstream. A missed
 * one is a search result that silently doesn't exist, which is the failure
 * this whole rewrite exists to avoid -- see lib/search/providers.ts.
 */
export function matchesTerm(expr: string, term: string): Prisma.Sql {
  return Prisma.sql`unaccent(lower(${Prisma.raw(expr)})) LIKE unaccent(lower(${`%${term}%`}))`;
}

/** A search term's condition against one row, given at query-build time. */
export type TermPredicate = (term: string) => Prisma.Sql;

/** The common case: a plain column (or column-like expression) on the row itself. */
export function textColumn(expr: string): TermPredicate {
  return (term) => matchesTerm(expr, term);
}

/**
 * A term that's already known to match every row of some provider -- a
 * constant keyword like Todo's "task", or Person's "person" -- needs no
 * database condition at all for that term: it's trivially satisfied. Reuses
 * the same substring rule `rankSearchEntries` matches keywords with
 * (`haystack.includes(term)`), so "cust" matches a constant of "custom
 * module" exactly the way the ranker would.
 */
export function matchesConstant(term: string, constants: readonly string[]): boolean {
  return constants.some((constant) => constant.includes(term));
}

/**
 * AND across terms, OR across predicates per term -- the SQL mirror of
 * `rankSearchEntries`'s "every term must appear somewhere" rule, used only
 * to narrow candidates before that ranker runs for real.
 */
export function candidateWhere(terms: readonly string[], predicates: readonly TermPredicate[], constants: readonly string[] = []): Prisma.Sql {
  const perTerm = terms.map((term) =>
    matchesConstant(term, constants)
      ? Prisma.sql`TRUE`
      : Prisma.sql`(${Prisma.join(predicates.map((predicate) => predicate(term)), " OR ")})`,
  );
  return Prisma.join(perTerm, " AND ");
}

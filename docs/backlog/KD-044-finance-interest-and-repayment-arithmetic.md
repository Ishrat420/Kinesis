# KD-044 — Finance: automatic interest and repayment arithmetic

**Status:** Planning Needed
**Priority:** Medium
**Tags:** Data Model, Architecture, Integration, Improvement

## Summary

Finance today is exactly what ADR-005 asked for: a high-level snapshot, not a budgeting tool, with `amount` as the source of truth and no automatic interest or repayment math — ADR-005 explicitly lists "Automatic interest calculations" and "Loan repayment schedules" as out of scope for the MVP, "to be introduced later." This is that later.

The MVP's manual-entry model has become the module's one real point of friction: an asset or liability with a `rate` already on it (the field exists — `FinanceItem.rate`, shown as "Interest / Growth Rate") just sits there today — nothing reads it. The user has to keep updating `amount` by hand every month to reflect interest accruing or a fixed repayment being made, or the number just goes stale.

## What exists today

* `FinanceItem` (`prisma/schema.prisma`) already has `rate: Float?`, alongside `amount`, `kind` (asset/liability/income/expense), `frequency`, `startDate`, `endDate`.
* `rate` is captured in `FinanceForm` (`app/(app)/finance/FinanceDashboard.tsx`) for asset/liability kinds and shown in `ItemSection`'s row (`{rate}% p.a.`), but nothing in `lib/finance.ts` or the dashboard totals ever reads it for a calculation. It is pure metadata today.
* `amount` is a plain number the user edits by hand on every save (`saveFinanceItemAction`, `app/(app)/finance/actions.ts`). Nothing moves it automatically between saves.

## The idea

Two changes, one that's ready to design now and one that's explicitly not.

### A. Derive the current balance instead of storing it (do this)

Store what's actually known — the `rate`, an optional fixed monthly payment amount, and when the value was last confirmed — and compute the projected current balance live on every read, the same way `lib/notifications/engine.ts` stopped being a stored cron sweep and became something derived fresh every time the bell is opened. `evaluateNotifications`'s own comment already states the principle this would extend: nothing is written just to be read back unchanged later; only the facts that actually change (rate, payment, last-known amount and date) are stored, and the rest is arithmetic.

This directly kills the "tedious manual entry" complaint: the number a person sees is always current without them ever having to open the item and retype it.

### B. "Is this on track," in the vocabulary Goals already has

Once there's a real trajectory (projected balance vs. time), the natural next question is the one `calculateGoalHealth` (`lib/goals/health.ts`) already answers for Goals: at this pace, is this converging or diverging? A debt with a fixed monthly payment against an accruing rate is structurally a countdown goal that also drifts upward between payments — something today's Goal model has no concept of, since a Goal only moves when a snapshot is logged by hand. Reusing the *vocabulary* — "AT RISK" vs "ON TRACK," "projected to reach $0 by \<date\>" — rather than the function itself means a person doesn't have to learn a second mental model for "is this concerning" the moment Finance grows one.

### Required for either A or B: an editable, visible history

Whatever gets added automatically each month has to be correctable and auditable, not a silent background mutation: store what was applied and when (an interest/payment ledger, in the same spirit as `GoalMetricSnapshot`), let the user open an item and see, for example, "the system added $42.10 in interest and subtracted your $200 payment on 1 Sept," and let them edit or back out an entry if the real bank statement disagreed. A silent auto-update the user can't see or correct would itself become a new source of the exact "I don't trust this number" problem the notification system already had to solve once, which is the whole reason it derives rather than stores.

## Deferred: real bank integration

The actual "never type a number again" version is connecting to the bank directly — read-only balance data through an aggregator (Basiq or Akahu, the providers built around Australia's and New Zealand's Open Banking / Consumer Data Right regimes) rather than per-bank integration, which nobody builds by hand anymore. The developer-facing side is genuinely approachable: an API key, a drop-in auth widget the user completes against their own bank (never through Kinesis), and a token to poll for balances.

What it actually costs is storing a live access token for someone's real bank connection — encryption at rest, rotation, and a real answer for what happens if it leaks. That's a materially different risk than anything Kinesis handles today, and it deserves to be taken seriously rather than bolted on. Kinesis's single-tenant, self-hosted shape (ADR-014) makes this lighter than it would be for a multi-tenant product — there is one person's token to protect, in a database already under that person's own control — but "lighter than a fintech SaaS" is not "no design needed."

Not chosen now: this stays a named, separate piece of future work, not a blocker on Sections A/B above. Nothing in the arithmetic design should assume a bank connection is coming — it should work exactly as well as a small, purely user-configured system, so that a future integration only has to supply the `amount`/`rate` inputs the manual fields already produce, not change the shape of what consumes them.

## Open questions

* Does the interest/payment ledger live as its own model (mirroring `GoalMetricSnapshot`), or as a lighter append-only log? A ledger is the more honest shape if editing or backing out individual months matters, per "Required for either A or B" above.
* Compounding frequency: `rate` is currently a flat "% p.a." with no stated compounding period. Monthly compounding (rate ÷ 12, applied monthly) is the simplest default and matches how a real loan or savings account usually compounds, but this should be an explicit decision, not an assumption baked silently into the arithmetic.
* Does this apply to both Assets (growth) and Liabilities (interest accruing against a debt), or start with just one? The framing above treats both symmetrically ("debt and asset").
* Where does the "AT RISK / ON TRACK" signal surface — the Finance page only, or does it also feed the unified "what's due / needs attention" work KD-017 is planning? KD-017's own review found Finance currently has zero presence in any awareness surface; this ticket is one candidate reason to finally give it one, once both are further along.

## Related

* ADR-005 — Finance MVP; explicitly lists "Automatic interest calculations" and "Loan repayment schedules" as out of scope "for MVP... these can be introduced later." This ticket is that later.
* ADR-014 — Single-Tenant Not Multi-Tenant Infrastructure; why the bank-integration risk calculus is lighter here than for a shared product, without being zero.
* `lib/goals/health.ts` (`calculateGoalHealth`) — the pace / at-risk vocabulary this ticket proposes reusing.
* `lib/notifications/engine.ts` — the derive-don't-store precedent this ticket's arithmetic model follows.
* KD-017 — turn dashboard into decision surface; found Finance absent from every current awareness surface, deferred pending this ticket.

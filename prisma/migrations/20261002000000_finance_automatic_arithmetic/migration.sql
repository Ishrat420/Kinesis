-- KD-044: Finance's `rate` field has always been captured and shown, but
-- nothing ever read it -- the owner had to keep retyping `amount` by hand to
-- reflect interest accruing or a repayment being made. `monthlyContribution`
-- is the optional fixed monthly repayment (liability) or contribution
-- (asset) that, alongside the existing `rate`, drives the automatic monthly
-- projection in lib/finance.ts.
--
-- `balanceAsOf` is the day `amount` was last confirmed accurate -- every
-- automatic projection starts counting from here, not from `updatedAt`
-- (which also moves on an edit that never touches `amount`, e.g. a rename).
-- Defaulted to the migration's own run time for every existing row: nothing
-- is actually known about when an existing balance was last accurate, so
-- treating it as "confirmed today" is the only honest starting point --
-- it applies no retroactive interest nobody asked for, rather than guessing
-- a past date and inventing months of accrual that never happened.
ALTER TABLE "FinanceItem" ADD COLUMN "monthlyContribution" DOUBLE PRECISION,
ADD COLUMN "balanceAsOf" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

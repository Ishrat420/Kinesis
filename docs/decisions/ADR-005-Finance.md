# Finance MVP — Implementation Brief

## Status

Accepted

---

## Context

Implement a simple Finance module for Kinesis.

The Finance MVP should be intentionally high-level. It is **not** a budgeting app, transaction tracker, accounting system, or investment platform.

The goal is to give the user a simple overview of:

* What they own
* What they owe
* Their recurring income
* Their recurring expenses
* Their current net worth
* Their monthly net cash flow

## Finance Page

Create a dedicated Finance dashboard page.

For MVP, Finance does **not** need the generic object list experience used by configurable modules.

The Finance page should behave like a specialised dashboard.

It should contain:

* Net Worth summary
* Total Assets
* Total Liabilities
* Monthly Income
* Monthly Expenses
* Net Monthly Cash Flow
* Asset list
* Liability list
* Recurring Income and Expense list
* `Add` action

Keep the visual style consistent with the other existing Kinesis module. 

Use similar 

* Card style
* Typography
* Spacing
* Lucide icons
* Soft borders
* Animations
* Same accent colour usage

---

# Finance Data Types

There are four primary Finance item types:

1. Asset
2. Liability
3. Income
4. Expense

Do **not** model recurring income as an Asset.

Do **not** model recurring expenses as Liabilities.

Assets and Liabilities represent values at a point in time.

Income and Expenses represent money flowing over time.

---

# Asset

Example:

```text
House in Mont Albert
$550,000

Cash
$2,000

Savings Account 1
$15,000
Interest: 2% p.a.
```

Suggested fields:

```text
Name *
Value *
Category
Interest / Growth Rate
Notes
```

Possible categories:

```text
Cash
Savings
Property
Investment
Vehicle
Superannuation
Other
```

`Interest / Growth Rate` is optional.

For MVP, do not automatically calculate interest or compound balances.

The current value entered by the user remains the source of truth.

---

# Liability

Examples:

```text
Loan from Mum
$1,000

Credit Card
$5,000
Interest: 15% p.a.
```

Suggested fields:

```text
Name *
Balance *
Category
Interest Rate
Notes
```

Possible categories:

```text
Credit Card
Mortgage
Personal Loan
Car Loan
Student Loan
Other
```

Interest rate is optional.

Do not calculate repayment schedules or interest projections in MVP.

---

# Income

Income represents recurring inflow.

Example:

```text
Monthly Earnings
$5,000 / month

Car Park Rent
$200 / month
```

Suggested fields:

```text
Name *
Amount *
Frequency *
Start Date
End Date
Notes
```

Initial frequency options:

```text
Weekly
Fortnightly
Monthly
Quarterly
Yearly
```

Start and end dates are optional.

---

# Expense

Expense represents recurring outflow.

Example:

```text
Living Expenses
$3,500 / month
```

Suggested fields:

```text
Name *
Amount *
Frequency *
Start Date
End Date
Notes
```

Use the same frequency options as Income.

This is intended for high-level recurring expenses.

Do not add individual transactions or transaction categorisation.

---

# Net Worth Calculation

Calculate:

```text
Net Worth = Total Assets - Total Liabilities
```

Example:

```text
Assets
$567,000

Liabilities
$6,000

Net Worth
$561,000
```

This should be a deterministic calculation from the current Asset and Liability values.

---

# Monthly Cash Flow

Recurring Income and Expenses may have different frequencies.

Normalise them to a monthly equivalent.

For example:

```text
Weekly amount
× 52 / 12

Fortnightly amount
× 26 / 12

Monthly amount
× 1

Quarterly amount
× 4 / 12

Yearly amount
÷ 12
```

Calculate:

```text
Monthly Net Cash Flow =
Monthly Income - Monthly Expenses
```

Example:

```text
Monthly Income
$5,200

Monthly Expenses
$3,500

Net Monthly Cash Flow
+$1,700
```

Positive values should clearly indicate positive cash flow.

Negative values should clearly indicate negative cash flow.

---

# Finance Dashboard Layout

Suggested structure:

```text
Finance                                      + Add

Your financial picture


NET WORTH

$561,000

Assets                 Liabilities
$567,000               $6,000


MONTHLY INCOME          MONTHLY EXPENSES

$5,200                  $3,500

Net flow
+$1,700


ASSETS

House in Mont Albert                    $550,000
Savings Account                          $15,000
Cash                                      $2,000


LIABILITIES

Credit Card                               $5,000
Loan from Mum                             $1,000


RECURRING

↑ Salary                        $5,000 / month
↑ Car Park Rent                   $200 / month
↓ Living Expenses               $3,500 / month
```

The exact visual implementation can follow the existing Kinesis design system rather than reproducing this layout literally.

---

# Add Flow

Use one main:

```text
+ Add
```

button.

When clicked, allow the user to choose:

```text
Add Asset
Add Liability
Add Income
Add Expense
```

Then show the appropriate form.

For MVP this can use a modal or drawer.

---

# Editing and Deleting

Finance items should support:

* Edit
* Delete

Use deliberate confirmation before deletion.

Editing an item should immediately update calculated totals.

---

# Data Model

Keep the implementation simple.

A single finance table with a `type` field is acceptable for MVP if it keeps the code clean.

Conceptually:

```text
FinanceItem

id
name
type
amount
category?
interestRate?
frequency?
startDate?
endDate?
notes?
createdAt
updatedAt
```

Where:

```text
type =
ASSET
LIABILITY
INCOME
EXPENSE
```

Alternatively, use separate models if the existing project architecture strongly benefits from it.

Do not over-engineer this yet.

---

# Out of Scope

Do not implement the following in this MVP:

* Bank integrations
* Transaction imports
* Transaction lists
* Transaction categorisation
* Detailed budgeting
* Stock pricing
* Investment performance
* Automatic interest calculations
* Loan repayment schedules
* Tax calculations
* Tax return preparation
* Credit scores
* Financial advice
* AI functionality

These can be introduced later.

---

# Design Principle

Finance should provide the user with a clear high-level picture of their financial position without requiring them to manage every individual transaction.

The intended experience is:

> I know what I have, what I owe, what comes in, what goes out, and whether my overall financial position is healthy.

Keep it simple, calm, and easy to maintain.

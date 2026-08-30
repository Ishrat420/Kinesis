# KD-018 — Standardise Module Navigation

**Status:** Done
**Priority:** Medium
**Tags:** UX / UI, Architecture, Technical Debt

## Summary

Every Kinesis module rendered its own page shell, so navigation behaved
differently depending on which module you were in.

Before this work:

* Dashboard, Relationships, Settings, Personal profile, and Custom modules
  rendered the top bar and sidebar.
* Documents, Finance, Goals, and Calendar rendered neither, and instead offered
  an ad-hoc "Back to dashboard" link.
* That back link was styled four different ways, and pointed at the dashboard
  even from pages nested inside a module.
* Page titles, descriptions, breadcrumbs, and header actions were rebuilt by
  hand on each page, with different type sizes, spacing, and max widths.

The result was that moving between modules felt like moving between different
applications, and there was no single place to change how navigation works.

---

## Product Principle

> Navigation should be a property of the application, not of each page.

Where you are, and how you get somewhere else, should look and behave the same
in every module.

---

## What Was Implemented

### One application shell

`components/layout/ModuleLayout.tsx` owns the top bar, the sidebar, and the
content padding. Pages supply content only, and choose a content width
(`narrow`, `standard`, `wide`, `full`).

Every signed-in route now renders inside it: Dashboard, Documents, Finance,
Goals, Calendar, Relationships, Custom modules, Settings, and Personal profile —
including nested pages such as expiring documents and milestones due soon.

### One page header

`components/layout/ModuleHeader.tsx` renders the standard header: optional back
link, breadcrumbs, icon, eyebrow, title, description, and header actions.

### One back-navigation control

`components/navigation/BackLink.tsx` replaces four different link styles.

Top-level module pages no longer carry a back link at all — the sidebar is
always present, so a link back to the dashboard is redundant. Detail pages keep
a back link, but it now points at the module the page belongs to rather than the
dashboard:

```text
Expiring documents  → Documents
Milestones          → Goals
A document          → Documents
A custom item       → its custom module
Personal profile    → Settings
```

### Breadcrumbs

`components/navigation/Breadcrumbs.tsx` replaces the hand-written
`Documents / Passport` and `Relationships / My constellation` strings, with the
parent crumb now linked.

### Navigation on small screens

The sidebar is desktop-only. Since module pages no longer carry their own back
links, narrow screens would otherwise have been left with no navigation at all,
so the top bar now includes a drawer (`MobileNavDrawer`) that renders the same
navigation markup the sidebar uses.

---

## Related

* KD-019 — Sidebar route awareness. Removing the per-page back links only works
  because the sidebar now shows where you are.

## Follow-ups

* The shell is a component each page renders, not a route-group layout. Moving
  the routes under a shared layout would let Next.js keep the navigation mounted
  across page transitions, and would remove the hand-built shell skeleton in
  `app/goals/[goalId]/loading.tsx`.
* `ModuleOverview`, `ModuleToolbar`, `ObjectList`, and `Section` remain empty
  placeholders. The list/section markup repeated across modules is the next
  candidate for the same treatment.

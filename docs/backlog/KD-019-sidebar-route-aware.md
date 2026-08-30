# KD-019 — Route-Aware Sidebar State

**Status:** Accepted — Needs Planning  
**Priority:** Medium  
**Tags:** Navigation, UX/UI, Cross-Module

## Summary

Currently, Dashboard is hardcoded as active in `Sidebar.tsx`, causing it to remain highlighted across other modules. components/navigation/Sidebar.tsx:49 — <SidebarItem active ... label="Dashboard" />. 
Dashboard is highlighted no matter where you are. It's a server component so it can't call usePathname. 

Make the sidebar active state reflect the user's current route.

## Expected Behaviour

The current module should be highlighted automatically:

- `/dashboard` → Dashboard
- `/documents/*` → Documents
- `/finance/*` → Finance
- `/goals/*` → Goals
- `/relationships/*` → Relationships
- `/calendar/*` → Calendar
- `/settings/*` → Settings
- `/modules/{id}/*` → corresponding custom module

Nested/detail pages must keep their parent module active.

## Design

Keep `Sidebar.tsx` as a **Server Component**.

Extract only the route-aware navigation into a small Client Component using:

```tsx
"use client";
import { usePathname } from "next/navigation";
````

The route should be the source of truth for active state.

Use safe parent-route matching:

```ts
function matchesRoute(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}
```

Use an exact match for Dashboard where appropriate.

## Implementation Notes

* Remove the hardcoded Dashboard `active` state.
* Reuse the existing `SidebarItem` and styling.
* Support system modules and dynamically loaded custom modules.
* Keep the client boundary as small as practical.
* Do not pass `activePage` manually from individual pages.
* Do not convert the entire Sidebar or authenticated app shell to a Client Component.
* Do not redesign the sidebar or change routes unnecessarily.
* Ensure only one primary destination is active at a time.

## Acceptance Criteria

* [ ] Active sidebar item correctly follows the current route.
* [ ] Nested routes retain their parent module's active state.
* [ ] Custom modules highlight correctly, including nested routes.
* [ ] Dashboard is no longer hardcoded as active.
* [ ] Existing sidebar navigation and styling remain unchanged.
* [ ] The main Sidebar/app shell remains server-rendered where possible.



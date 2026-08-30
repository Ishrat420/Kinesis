# KD-019 — Route-Aware Sidebar State

**Status:** Done  
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

* [x] Active sidebar item correctly follows the current route.
* [x] Nested routes retain their parent module's active state.
* [x] Custom modules highlight correctly, including nested routes.
* [x] Dashboard is no longer hardcoded as active.
* [x] Existing sidebar navigation and styling remain unchanged.
* [x] The main Sidebar/app shell remains server-rendered where possible.



---

## Implementation

`lib/navigation/active-route.ts` holds the matching, as specified:

```ts
isRouteActive(pathname, href)
```

* an entry is active on its own route and on everything nested under it;
* `/` matches only itself, so the dashboard does not light up everywhere;
* trailing slashes, query strings, and fragments are ignored, so
  `/calendar?month=2026-08` still highlights Calendar;
* a shared prefix that is not a path boundary does not match, so
  `/documents-archive` does not activate `/documents`.

`components/navigation/SidebarNavLink.tsx` is the only new client boundary: it
reads `usePathname()`, applies the existing active styling, and sets
`aria-current="page"`. `Sidebar.tsx` stays a server component and still loads
custom modules server-side; `DraggableCustomModuleLink` uses the same helper, so
custom modules highlight like built-in ones and stay draggable.

Both entries share `navItemClassName` in `components/navigation/nav-item.ts`, so
there is one definition of what an active navigation item looks like.

## Testing

`tests/unit/navigation-active-route.test.ts` covers exact matches, nested
routes, prefix near-misses, the dashboard special case, query/fragment
handling, and a missing pathname.

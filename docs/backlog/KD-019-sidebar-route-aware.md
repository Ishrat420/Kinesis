# KD-019 — Route-Aware Sidebar

**Status:** Done
**Priority:** Medium
**Tags:** UX / UI

## Summary

The sidebar highlighted "Dashboard" on every page, because the active state was
hard-coded:

```tsx
<SidebarItem active icon={Home} label="Dashboard" href="/" />
```

Whichever module you opened, the sidebar claimed you were on the dashboard. It
was decoration rather than navigation, and it also meant the sidebar could not
be relied on to tell users where they were.

---

## What Was Implemented

### Active state derived from the current route

`lib/navigation/active-route.ts` exports `isRouteActive(pathname, href)`:

* an entry is active on its own route and on everything nested under it, so
  `/documents/expiring-soon` keeps **Documents** highlighted and
  `/custom-modules/<id>/items/<id>` keeps that custom module highlighted;
* `/` matches only itself, otherwise the dashboard would light up everywhere;
* trailing slashes, query strings, and fragments are ignored, so
  `/calendar?month=2026-08` still highlights **Calendar**;
* a prefix that is not a path boundary does not match — `/documents-archive`
  does not activate `/documents`.

### Shared, accessible navigation entries

`components/navigation/SidebarNavLink.tsx` is a client component that reads
`usePathname()` and applies the active treatment, and sets `aria-current="page"`
so assistive technology reports the current page too.

Custom module links (`DraggableCustomModuleLink`) use the same helper and the
same styling, so a custom module highlights exactly like a built-in one while
staying draggable onto the dashboard's Module Shortcuts.

Both entries share `navItemClassName` so there is one definition of what an
active navigation item looks like.

---

## Testing

`tests/unit/navigation-active-route.test.ts` covers exact matches, nested
routes, prefix near-misses, the dashboard special case, and query/fragment
handling.

---

## Related

* KD-018 — Standardised module navigation. The shell put the sidebar on every
  page; this ticket made it say where you are.

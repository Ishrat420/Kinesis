# KD-020 — Mobile Navigation & Responsive App Shell

**Status:** Accepted — Needs Planning  
**Priority:** High  
**Tags:** UX/UI

## Summary

Add proper mobile navigation and standardise responsive layout behaviour across Kinesis.

Currently, the desktop Sidebar uses `hidden md:block`, meaning it disappears below the `md` breakpoint without providing an equivalent navigation mechanism. Mobile users may therefore have access to search, notifications and their profile, but no obvious way to navigate between Kinesis modules.

## Requirements 

For screens below `md`:

- Add a navigation/menu button to the `Topbar`.
- Open the existing Kinesis navigation inside a mobile drawer/overlay.
- Reuse the same navigation structure, module list, active-state logic and custom modules as the desktop Sidebar.
- Closing/selecting a destination should dismiss the drawer appropriately.
- Do not create a separate hardcoded mobile navigation model.

A bottom navigation bar may be explored later, but a drawer should be the initial implementation to preserve the existing Kinesis information architecture.

### Desktop Behaviour

**This change must not alter or regress the existing desktop navigation experience.**

At `md` and above:

- Existing Sidebar remains visible.
- Existing Topbar behaviour remains intact.
- Do not add redundant hamburger/mobile navigation.
- Existing active states, custom modules and navigation interactions continue to work.

Mobile navigation should be an alternative presentation of the same navigation system, not a replacement for desktop navigation.

### Responsive Layout

Standardise page padding where appropriate:

```css
px-4 sm:px-6 md:px-10
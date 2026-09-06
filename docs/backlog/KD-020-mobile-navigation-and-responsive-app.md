# KD-020 — Mobile Navigation & Responsive App Shell

**Status:** Done  
**Priority:** High  
**Tags:** UX/UI

> **Note:** the mobile drawer below was implemented as part of KD-018, because
> that change removed the "Back to dashboard" links mobile users were relying
> on. See `components/navigation/MobileNavDrawer.tsx`. The responsive layout
> work that remained is described under "What was done".

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
```

## What was done

The drawer arrived with KD-018. This closes the responsive layout half.

The page padding was already `px-4 sm:px-6 md:px-10` on the shell's content
column, so rather than repeating the scale it now comes from
`lib/layout/responsive.ts`, which is also where the rule the rest of this work
follows is written down: a page is laid out for one column that narrows with the
viewport, and the narrowest viewport Kinesis draws for is 320px — 288px of
content once the shell's padding is off.

Measured against that, the changes were:

- **Top bar.** Below `md` the bar is an ordinary row — menu, search, actions —
  so the search field takes the width that is left instead of being squeezed
  between two fixed insets. From `md` it is absolutely centred across the header
  exactly as before.
- **Page titles.** `ModuleHeader` steps its title down to 30px below `sm`; at
  38px a two-word module name took most of a phone screen.
- **Documents.** The list row asked for 432px of fixed track and gap before the
  document's name got a single pixel — more than the content column has beside
  the sidebar even at `md`. It stacks until `lg` now, the shape the goals list
  already used. The search field is full width below `sm` and sits under the
  heading rather than beside it.
- **Custom modules.** The item row stacks its status onto a second line below
  `sm` instead of squeezing it into a 44px column.
- **Calendar.** A seventh of a phone screen cannot hold a readable pill, so
  below `sm` each item in a day cell is a coloured dot and the existing day
  overview carries the detail. Day cells and the weekday header shrink to match,
  and the filter panel no longer runs past the content column.
- **Relationships.** The inspector was `hidden sm:block`, which left a phone
  with a constellation nobody could edit. Below `sm` it is now a bottom sheet
  over the lower half of the map; from `sm` it is the side panel it has always
  been, with its dragged width carried as a custom property because an inline
  width cannot be held to a breakpoint. The zoom controls move above the sheet
  and the Ctrl/Cmd-click hint, which describes something a phone cannot do,
  is hidden with it.
- **Settings.** The reminder lead-day rows wrap the number field onto its own
  line rather than crushing the label it belongs to.

Desktop is unchanged from `md` up, apart from the documents row, which was
already overflowing its own tracks in the `md`–`lg` band and now stacks there.

`tests/unit/responsive-layout.test.ts` holds the rule: no unconditional grid
template may declare more fixed pixel track than 320px leaves, the shell keeps
sole ownership of the page padding, and the drawer reaches only where the
sidebar is hidden.


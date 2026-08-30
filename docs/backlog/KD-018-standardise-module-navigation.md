# KD-018 — Standardise Module Navigation

**Status:** Done  
**Priority:** High  
**Tags:** UX/UI, Architecture

## Summary

Standardise navigation and layout across Kinesis so that users remain inside one consistent application shell while moving between modules.

Currently, some areas such as Relationships and custom modules use the full Kinesis shell:

- Persistent sidebar
- Global search
- Notifications
- Profile/avatar
- Module navigation
- System navigation

So Topbar + Sidebar are pasted into 6 page files individually. Documents, Goals, Finance, and Calendar have none of it. app/documents/page.tsx:26, app/goals/page.tsx, app/finance/page.tsx, app/calendar/page.tsx all render a bare <main> with a "Back to dashboard" link as a substitute for navigation. So global search (⌘K), the notification bell, and the module nav all disappear the moment you leave the dashboard.

Move the shell into a route-group layout (app/(app)/layout.tsx) so it deletes duplicated markup rather than adding any.

Documents etc use a standalone page layout with a **Back to dashboard** button and without the persistent application navigation.

This creates inconsistent navigation behaviour and makes some modules feel like separate mini-applications.

The Kinesis application shell should remain persistent across normal authenticated navigation.

## Requirement 

> The Kinesis application shell should not disappear during normal navigation inside the authenticated app.

Only the main content area should change.

The shell should include:

- Sidebar
- Global search
- Notification access
- User/profile access
- Module navigation
- System navigation


### Standard Module Layout

Top-level module pages should use the same shell structure.

Example:

```text
┌──────────── Sidebar ───────────┬──────────────────────────────┐
│ Kinesis                        │ Global search       🔔 👤     │
│                                ├──────────────────────────────┤
│ Dashboard                      │ Documents                    │
│                                │ Store, track and connect...  │
│ MODULES                        │                              │
│ Documents  ← active            │ [Add manually] [Upload]      │
│ Finance                        │                              │
│ Goals                          │ Module content               │
│ Relationships                  │                              │
│ Custom modules                 │                              │
│                                │                              │
│ SYSTEM                         │                              │
│ Calendar                       │                              │
│ Settings                       │                              │
└────────────────────────────────┴──────────────────────────────┘



## Considerations

There is one thing to keep, 

Top-level module page → no Back button.
You're already somewhere represented in navigation.

Nested/detail page → back navigation is needed. 

For example:

← Back to Documents
Passport

Likewise:

Goals / Buy a house
Custom module / object 

That navigation takes you up one level, rather than arbitrarily sending you all the way to Dashboard.
So that needs to be preserved 


---

## Implementation

### The shell is a route-group layout

`app/(app)/layout.tsx` renders the top bar, the sidebar, and the padded content
area. Every authenticated route moved under `app/(app)/` — Dashboard,
Documents, Finance, Goals, Calendar, Relationships, Custom modules, Settings,
and Personal profile. Route groups do not affect URLs, so every path is
unchanged; sign-in stays outside the group and keeps its bare page.

The shell is now mounted once and stays mounted between pages, so the six
copies of `<Topbar /><Sidebar />` and the four bare `<main>` wrappers are gone
rather than replaced by another wrapper.

### Standard content width and header

* `components/layout/ModuleContent.tsx` — the four content widths pages choose
  from, instead of each page inventing its own max width.
* `components/layout/ModuleHeader.tsx` — back link, breadcrumbs, icon, eyebrow,
  title, description, and header actions.
* `components/navigation/BackLink.tsx` and `Breadcrumbs.tsx` — one back control
  and one breadcrumb trail, replacing four link styles and the hand-written
  `Documents / Passport` strings.

### Back navigation goes up one level

Top-level module pages have no back button; the sidebar already says where you
are. Detail pages go up one level rather than to the dashboard:

```text
Expiring documents  → Documents
Milestones          → Goals
A document          → Documents
A custom item       → its custom module
Personal profile    → Settings
```

### Note on mobile

Removing the "Back to dashboard" links leaves screens below `md` with no
navigation, because the sidebar is `hidden md:block`. To avoid shipping that
regression, the drawer described in KD-020 was built as part of this change:
`components/navigation/MobileNavDrawer.tsx`, opened from the top bar and
rendering the same `SidebarNav` markup. Desktop behaviour is untouched. The
rest of KD-020 (responsive review of each module's content) is still open.

### Related

* KD-019 — the sidebar's active state. Removing the per-page back links only
  works because the sidebar now shows where you are.

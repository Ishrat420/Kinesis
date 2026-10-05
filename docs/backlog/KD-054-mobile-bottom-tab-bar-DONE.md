# KD-054 — Mobile Bottom Tab Bar

**Status:** Done — pending Android test
**Priority:** High
**Tags:** UX / UI

## Pending

- **Android test:** the tab bar, the More sheet and the bottom spacing have
  only been tested on iPhone.
- **Swipe down to close the More sheet:** built, but not yet tried on a real
  phone.

## Summary

On phones, replace the top-left ☰ menu with a bottom tab bar, so the main
sections are one thumb-reach tap away, like a native app. Desktop keeps the
sidebar as it is.

## Tabs (fixed, never scrolling)

| Tab | Opens |
|---|---|
| Home | Dashboard |
| To-dos | To-dos |
| **+** (centre) | Quick capture |
| Calendar | Calendar |
| More | The More sheet (below) |

- A floating, frosted pill above the bottom edge (the approved mock-up), with
  a soft highlight that slides to the current tab.
- Each tab is an icon with a small label underneath.
- Monochrome, matching the app: the current tab is a black, filled icon with
  a dark label; the others are grey. No colour.
- The bell, search and profile stay in the top bar.

## More sheet

- Slides up from the bottom. It closes when you swipe it down, tap outside
  it, or pick an item.
- It lists what the ☰ menu lists today: Documents, Finance, Goals,
  Relationships, custom modules, Add module, and Settings. It reuses the same
  navigation source, so the sheet, the sidebar and the drawer can't drift
  apart.
- **More** shows as the current tab while you're on any page reached
  through it.

## Quick capture (+)

- Opens the existing quick capture (today the top search box's "type
  something to capture" flow). It doesn't add a second capture mechanism.
- Decided: **+** focuses the existing box in the top bar, so the keyboard comes
  up straight away and search and create work exactly as they do now.

## Considerations

- **Phones only:** the bar shows below `md`, where the sidebar is hidden,
  and the ☰ button and `MobileNavDrawer` are removed at those widths.
- **Safe area:** leave room for the iPhone home indicator
  (`env(safe-area-inset-bottom)`). Don't draw the indicator line itself.
- **Bottom space:** every page needs enough padding at the bottom that its
  last row or button isn't hidden behind the bar.
- **Keyboard:** hide the bar while the on-screen keyboard is open.
- **Feedback:** tabs get the existing press feedback, 44px tap targets, and
  the `useLinkStatus` loading hint (see the earlier mobile work).
- **Not in scope:** hiding the bar on scroll, and dark mode.
- **Previews:** the floating round button seen on preview deployments is
  Vercel's preview toolbar, not part of Kinesis, and isn't affected by this.

# KD-005 — Customisable Module Widgets

**Status:** Done
**Priority:** Medium

## Summary

Allow users to customise which modules appear in the dashboard's module/widget area.

Modules can be added by dragging them from the current **Areas** (will be renamed) sidebar into "Module Shortcuts"

Users can also remove modules from the dashboard without removing the actual module from Kinesis.

```text
Areas                       Dashboard Modules

Documents   ───────────→    [ Documents ]
Finance                      [ Goals     ]
Vehicles                     [ Skincare  ]
Goals
Skincare
```

The dashboard Module Shortcuts area acts as a collection of shortcuts/widgets for the modules most important to the user.

## Notes

* Adding/removing a dashboard widget does not create or delete the underlying module.
* Modules remain accessible from the **Areas** sidebar.
* Support drag-and-drop addition.
* Dashboard widgets should eventually support reordering.
* This establishes the dashboard as a user-customisable space rather than a fixed representation of all modules.

# BUG-003: Removing a goal measure leaves milestones in an invalid state

**Status:** Fixed
**Priority:** High

## Problem

When a measured target is added to a goal and later removed, existing milestones can retain references to that measure. This leaves the milestones in an invalid state: when a user edits an unrelated field, such as the milestone name, the measure input appears enabled and the milestone does not save normally.

## Current behaviour

1. A user adds a measured target to a goal.
2. The goal already has one or more milestones, or milestones are created afterward.
3. A milestone uses the goal's measure.
4. The user removes the measured target from the goal.
5. The measure is removed without warning, even though a milestone still references it.
6. When the user later edits the milestone, including an unrelated field such as its name:
   - the measure input is unexpectedly enabled or shown;
   - the milestone is left with an invalid measure reference; and
   - the milestone does not save normally.

This can also affect a pre-existing milestone that does not visibly have a measured value, if stale measure state remains associated with it.

## Expected behaviour

### When the measure is used by a milestone

- The user must receive clear confirmation that removing the measure from the goal will also remove it and its associated values from every milestone that uses it.
- This must include all milestones, regardless of status, including overdue, inacive, and completed milestones.
- Otherwise, the goal and its milestones must remain unchanged if the deletion is rejected.


Suggested message:

> Are you sure? This measure is used by one or more milestones. Removing it from the goal will also remove it from all active and inactive milestones


If the user confirms:
- remove the measure from the goal cleanly
- remove the measure reference and associated value from every affected milestone cleanly
- preserve all other goal and milestone data
- After removal, milestones must not retain stale measure identifiers, values, validation state, or enabled measure inputs.
- Remove any calculation that used a target measure to 
- Users must be able to edit and save any milestone normally, including changes unrelated to measurement.
- Any calculation that depended on the removed measure must be removed or recalculated. A result such as On track, At risk, or Ahead must not remain if it can no longer be calculated.

### When the measure is not used by any milestone even if it's present at the goal level 

- The user can remove the measured target from the goal as they do currently.
- After removal, milestones must not retain stale measure identifiers, values, validation state, or enabled measure inputs.
- Users must be able to edit and save any milestone normally, including changes unrelated to measurement.
- Any calculation that depended on the removed measure must be removed or recalculated. A result such as On track, At risk, or Ahead must not remain if it can no longer be calculated.


## Test scenarios

- Remove a measure used by an active milestone: confirmation is shown; confirming removes the measure and its milestone value.

- Remove a measure used only by an inactive or completed milestone: confirmation is shown and the same cascading removal occurs.

- Cancel the confirmation: the goal and all milestones remain unchanged.

- Remove a measure used by multiple milestones: confirming removes it and its values from every affected milestone.

- Remove a measure used by progress or goal-health calculations: the dependent calculations are removed or recalculated and no stale status remains.

- Remove an unused measure from a goal: removal succeeds without the cascading-deletion warning.

- After successful removal, rename a pre-existing milestone: save succeeds and no measure input is unexpectedly enabled.

- After successful removal, edit another non-measure milestone field: save succeeds.

- Refresh and reopen the goal and milestones: no stale measure state or calculated status returns.

## Implementation note

Enforce this behaviour on the server as well as in the interface. The goal measure, milestone references and values, and dependent calculations must be removed in one atomic operation to prevent orphaned references, stale calculated states, or partial updates.

## Fix

The measure and everything measured in it are now removed together, in one
transaction, and the cascade is announced before it runs.

* **Removal asks first when it costs something.** If any milestone holds a value
  in the measure, `removeTargetAction` refuses an unconfirmed request and returns
  the warning; the dialog carries the same words. The gate is on the server, not
  only in the dialog, so a form left open before a milestone took a value cannot
  slip past it. Cancelling writes nothing at all.

* **A measure nothing uses is removed as directly as before.** No dialog, no
  extra click. The confirmation exists for the cascade, not for the removal.

* **The cascade reaches every milestone, whatever its status.** One
  `updateMany` over the goal's milestones clears the value on all of them --
  active, overdue, inactive, completed -- along with the goal's own target,
  current value and unit, and the metric history goal health averages. There is
  no ordering in which a milestone value can outlive the measure it was
  expressed in.

* **Calculated results go with their inputs.** Goal health reads the target
  against the current value over that history: with all three gone, no ON
  TRACK, AT RISK or AHEAD can survive the removal. `autoCompleted` is cleared
  for the same reason -- it claims a completion was calculated from the measure,
  and that comparison can no longer be made. The completion itself is left
  alone; it is milestone data, and it stays the owner's to reopen.

* **Nothing measured comes back afterwards.** A milestone value only means
  something against a goal that has a measure, so a goal without one stores none
  whatever a form submits. The milestone row hides the value input when the goal
  has no measure, and `addMilestoneAction` and `updateMilestoneAction` drop a
  submitted value rather than trusting it. Renaming a milestone after a removal
  saves the name and leaves the value null, which is the edit that used to fail.

`lib/goals/measure.ts` holds what the two ends share: the warning, and the count
of milestones using the measure. The page counts them to decide whether to ask;
the action counts them again to decide whether it may proceed without having
been asked, so the dialog and the gate cannot come to disagree.

`tests/integration/goals/goal-measure-removal.test.ts` runs the scenarios above
against the database, including the untouched-on-cancel case and the rename that
follows a removal.

## Related

* ADR-004 — Goals Module

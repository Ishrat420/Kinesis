# BUG-003: Removing a goal measure leaves milestones in an invalid state

**Status:** Open
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
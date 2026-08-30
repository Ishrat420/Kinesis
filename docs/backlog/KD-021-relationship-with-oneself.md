# KD-021 — Relationship Inspector Cleanup & Multi-Select Connect

**Status:** Done  
**Priority:** High
**Tags:** UX/UI

## Summary

Relationship Inspector Cleanup and add a faster way to create connections directly from the constellation.

## Relationship With Myself

The current **Relationship with myself** card inside (`isSelf`) Details should be removed.

For the self (`isSelf`) person only, rename the existing inspector tab:

```text
Relationship details
````

to:

```text
Relationship with myself
```

The tab should contain the existing Relationship details elements present for any other relationship except for linked goals.


---

## Ctrl/Cmd Multi-Select to Connect

Allow users to select two people directly on the constellation and initiate a connection.

### Interaction

1. Select the first person.
2. Hold:

   * `Ctrl` on Windows/Linux, or
   * `Cmd` on macOS
3. Select a second person.
4. Visually indicate that both people are selected.
5. Show an action:

```text
Connect Person1 and Person2
```

6. Selecting the action opens the existing relationship/connect dialog with both people preselected.

Reuse the existing connection creation workflow rather than introducing separate relationship logic.

### Behaviour

* Maximum multi-selection for this interaction is two people.
* Clicking empty constellation space clears the selection.
* `Escape` clears multi-selection.
* Do not allow self-to-self connections.
* Do not create duplicate/reversed relationships.
* Existing single-person selection and inspector behaviour must continue working.
* Normal drag/move behaviour of constellation nodes must not be broken.

Because modifier-key selection is desktop-specific, this must **not be the only way to connect people**. The existing `Connect` interaction should remain available for touch/mobile and accessibility.

---

## Implementation Notes

**Relationship with myself**

* The placeholder card in Person details has been removed.
* For the self (`isSelf`) bubble the second inspector tab is now labelled
  `Relationship with myself` and holds the relationship elements — connection
  practices, reflections, important dates and notes — but no linked goals.
  Relationship type and "remove connection" are also absent: there is only ever
  one of these and it cannot be disconnected.
* The self bubble's relationships with other people are unchanged and are still
  edited from the other person's inspector or by selecting the connection line.
* Storage reuses the `selfPersonId` columns that already existed on
  `ConnectionPractice`, `RelationshipReflection` and `RelationshipImportantDate`,
  so self practices and dates flow into the Calendar like any other. Notes
  needed a new `Person.selfNotes` column.

**Ctrl/Cmd multi-select to connect**

* `Ctrl` (Windows/Linux) or `Cmd` (macOS) plus a click on a second bubble selects
  a pair; both bubbles show the selection ring and a prompt offers
  `Connect Person1 and Person2`, which opens the existing connection dialog with
  both people preselected.
* A modifier-click never starts a drag, so moving bubbles is unaffected.
* Selection is capped at two people, clears on `Escape`, on clicking empty space,
  and on starting the inspector's `Connect` flow. Re-picking a selected person
  deselects them, so a person can never be paired with themselves.
* Already-connected pairs are named in the prompt but offer no action, so no
  duplicate or reversed relationship can be created.
* The inspector's `Connect` button is untouched and remains the way to connect
  people on touch devices.

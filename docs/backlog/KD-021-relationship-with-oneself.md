# KD-021 — Relationship Inspector Cleanup & Multi-Select Connect

**Status:** Accepted — Needs Planning  
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



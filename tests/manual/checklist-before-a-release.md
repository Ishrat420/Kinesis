# Pre-Release Manual Verification Checklist

Complete this checklist before creating the final release tag.

These checks complement automated and unit testing and are intended to verify that Kinesis's core user flows are functioning correctly in the release environment.

## Authentication & Access

- [ ] Owner can sign in successfully and reach the dashboard.
- [ ] Verify anonymous and non-owner users cannot access protected content.

## Documents

- [ ] Create a document.
- [ ] Edit an existing document.
- [ ] Search for and find a document.

## Goals & Milestones

- [ ] Create a goal.
- [ ] Create a milestone for a goal.
- [ ] Update an existing milestone.

## Relationships

- [ ] Add a person and create a relationship.
- [ ] Add an important date to a relationship.
- [ ] Link a goal to a relationship.

## Custom Modules & Fields

- [ ] Create a custom module.
- [ ] Create and populate a custom field.
- [ ] Create a Kinesis Link and verify it opens the linked object.

## Calendar

Verify that dated records appear correctly in the Calendar:

- [ ] Document expiry date.
- [ ] Relationship important date.
- [ ] Milestone due date.
- [ ] Goal due date.

## Needs Attention

- [ ] Verify an attention item appears when expected.
- [ ] Open the attention item.
- [ ] Handle/resolve the item and verify the attention state updates correctly.

## Data Export

- [ ] Complete recent-auth verification when prompted.
- [ ] Export user data successfully.
- [ ] Verify the export is generated and contains expected data.

## Release Gate

- [ ] All required manual checks above have passed.
- [ ] Automated/unit tests are passing.
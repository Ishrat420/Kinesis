# ADR-003 — Document Module

## Status

Accepted

---

## Context

Documents are one of the foundational areas of Kinesis.

Important information is frequently represented by files: passports, licences, registrations, insurance policies, warranties, certificates, contracts, receipts, tax documents and many others.

These files often belong to another part of a person's life. A vehicle registration relates to a vehicle. An insurance policy may relate to a home. A pathology report may relate to a Health.

Kinesis should provide one central place to find and manage these files without requiring the user to upload or maintain the same information multiple times.

## Decision

### Documents is a Core Module

The Documents module will act as the central library for files stored in Kinesis.

Unlike configurable modules such as Health, Documents is a core system module and cannot be removed.

The Documents module provides:

* File upload and storage
* Document organisation
* Search and filtering
* Metadata and custom fields
* Expiry and other important dates
* Reminders
* Relationships to other objects
* AI-assisted metadata extraction

### Files are Objects

Files will participate in the same Object system as other Kinesis entities.

Conceptually:

```text
Object
├── File
├── Vehicle
├── Goal
├── Person
├── Health Record
└── ...
```

The Documents module is therefore primarily a view over File objects.

Conceptually:

```sql
SELECT *
FROM objects
WHERE object_type = 'file';
```

A File object may contain properties such as:

```text
Name
File
Document type
Issue date
Expiry date
Issuer
Reference number
Notes
Tags
Custom fields
```

Not every File object is required to have every field.

### Documents Can Be Related to Other Objects

Files do not need to exist in isolation.

A File object can be related to any other object.

For example:

```text
Toyota Corolla
│
├── Registration.pdf
├── Insurance.pdf
├── Purchase Receipt.pdf
└── Service Invoice.pdf
```

These files continue to exist once in Kinesis.

The Documents module can show:

```text
Registration.pdf
Insurance.pdf
Purchase Receipt.pdf
Service Invoice.pdf
```

while the Toyota Corolla object can show the same files under its related documents.

No duplicate file or duplicate metadata is required.

### Contextual Uploads

Although Documents is the central file library, file uploads should not be restricted to the Documents module.

Any object that supports files may provide an upload action.

For example:

```text
Vehicles
→ Toyota Corolla
→ Upload Document
```

This creates a File object in the central Documents system and automatically establishes a relationship with the Toyota Corolla object.

Therefore:

> All files are managed by Documents, but files may be linked anywhere that provides meaningful context.

Uploading from Documents without an existing context may create an initially unlinked File object.

### Relationship Mapping

Relationships may be established through three mechanisms:

1. **Contextual linking** — a file uploaded from an object's page is automatically related to that object.
2. **Manual linking** — the user selects an existing object to relate the file to.
3. **Suggested linking** — Kinesis may identify a likely relationship from extracted metadata and suggest it to the user.

AI-generated relationship suggestions should not silently make significant changes without appropriate user confirmation.

### Dates and Reminders

Document dates remain normal object fields.

For example:

```text
Issue Date
Type: Date

Expiry Date
Type: Date
```

A date may optionally participate in the reminder system.

For example:

```text
Expiry Date
14 April 2027

Reminder
6 months before
3 months before
30 days before
7 days before
```

This allows different document types to use dates differently without requiring every date to generate a reminder.

### Computed Fields

Documents may use computed fields derived from other fields.

For example:

```text
Expiry Date
14 April 2027

Time Remaining
7 months left
```

`Time Remaining` is not persisted as authoritative data.

It is calculated from:

```text
Expiry Date - Current Date
```

Computed values should normally be calculated when displayed rather than periodically written back to the database.

### AI-Assisted Extraction

AI may be used to reduce manual data entry when a document is uploaded.

For example, uploading a passport may allow Kinesis to suggest:

```text
Document Type: Passport
Name: Australian Passport
Expiry Date: 14 April 2031
Passport Number: ********
```

Uploading a registration document may allow Kinesis to identify:

```text
Document Type: Vehicle Registration
Registration: ABC123
Expiry Date: 28 June 2027
Possible related object: Toyota Corolla
```

Extracted information should be presented as suggested structured data for confirmation where appropriate.

AI is an enhancement to the Document system, not a requirement for the underlying object model.

## Object Detail Experience

Opening a document should display the File object using the standard Kinesis object experience.

For example:

```text
Australian Passport

Passport

Expiry
14 Apr 2031

Time remaining
4 years 8 months

────────────────────────

DETAILS

Passport number
•••••••••

Issued
14 Apr 2021

Country
Australia

────────────────────────

REMINDERS

Expiry reminder
6 months before
30 days before

────────────────────────

RELATED

Person
Ishrat

────────────────────────

FILE

passport.pdf
```

Fields remain customizable where appropriate.

## Design Principles

The Document module should follow these principles:

### Store Once, Surface Everywhere

A file should exist once and may appear in multiple relevant contexts through relationships.

### Context Should Reduce Work

When Kinesis already knows the context of an upload, the user should not be required to manually provide that relationship again.

### Flexible Rather Than Document-Specific Schemas

Kinesis should not require separate database models for every possible document type.

Different documents can use different combinations of fields.

### Important Dates Should Become Actionable

Documents should not merely store expiry dates. They should be capable of generating reminders and surfacing upcoming actions.

### AI Should Remove Administration, Not Create It

AI should primarily assist with extraction, classification and relationship suggestions rather than introducing additional configuration.

## Consequences

This architecture means the Documents module becomes more than a file manager.

It acts as the central document layer of Kinesis while allowing files to participate naturally in Vehicles, Health, Finance, Goals, custom modules and future areas.

It also establishes several capabilities that can be reused throughout Kinesis:

* Universal Objects
* Custom fields
* Computed fields
* Object relationships
* File relationships
* Reminders
* Contextual creation
* AI-assisted extraction

These capabilities should be implemented as shared Kinesis infrastructure wherever practical rather than being exclusive to the Documents module.

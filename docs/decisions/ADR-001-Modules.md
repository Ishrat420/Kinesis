# ADR-001: Modules

## Status

Accepted

## Context

Kinesis is designed to help users manage many interconnected areas of life, such as documents, finance, health, vehicles, goals, relationships, and any other custom personal interests. Modules exist because users need mental structure.

Users need structure so the app feels understandable and organised.

At the same time, Kinesis must avoid becoming a set of disconnected mini-applications.

A module is a view and organisational container. It should not duplicate data. Objects are reusable across Kinesis.


## Decision

Kinesis will use **Modules** as the primary organisational layer.

Modules provide a familiar place for users to go when managing a specific area of life.

Examples:

- Documents
- Finance
- Health
- Vehicles
- Goals
- Relationships
- Custom modules such as Skincare, Plants, Wedding, Pets, or Travel

Modules organise objects.

Modules do not own objects.

Objects exist once and may appear in multiple modules.

## Resolved Questions

System Modules are stable first-party areas.
Custom Modules are flexible user-created areas.
Objects are not owned by multiple modules.
Objects are linked where relevant.

## Module Types

### System Modules

System Modules are built into Kinesis and may have dedicated routes, layouts, and specialised user experiences.

Examples:

- `/documents`
- `/finance`
- `/health`
- `/vehicles`
- `/goals`

System Modules may include custom dashboards, integrations, AI extraction flows, and domain-specific views.

### Custom Modules

Custom Modules are created by users.

Custom Modules are stored in the database, not created as code folders.

A custom module should be rendered through a generic route such as:

```text
/modules/[moduleId]


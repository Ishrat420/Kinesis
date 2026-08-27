# ADR-002: Module Framework

## Status

Accepted

---

## Context

Kinesis is built around Modules.

As the number of Modules grows, each one must feel familiar while still supporting its own specialised functionality.

Without a common framework, every Module would become its own mini-application, increasing complexity and creating an inconsistent user experience.

The goal is for users to instantly understand any Module, whether it is a built-in System Module or a user-created Custom Module.

---

# Decision

Every Module in Kinesis follows the same overall framework.

A Module is a structured view over a collection of related Objects.

Modules organise information.

Objects own information.

---

# Module Structure

Every Module consists of the following conceptual sections.

```
Module

├── Overview
├── Toolbar
├── Views
├── Objects
├── Relationships
├── Activity
├── Insights
└── Settings
```

Not every Module will expose every section immediately.

However, every Module should be designed with this framework in mind.

---

# Overview

The Overview provides a high-level understanding of the Module.

Examples include:

- Number of tracked objects
- Upcoming reminders
- Recent changes
- Health score
- AI summary
- Progress indicators

The Overview should answer:

> "How is this area of my life doing?"

---

# Toolbar

Every Module shares a common toolbar.

Typical actions include:

- Search
- Filter
- Sort
- Change View
- AI Actions
- Add Object

This creates consistency across the application.

Users should never need to relearn basic navigation.

---

# Views

Modules may present information in multiple ways.

Examples include:

- List
- Grid
- Table
- Timeline
- Calendar
- Gallery

Not every Module requires every view.

Views represent different visualisations of the same underlying Objects.

---

# Objects

Objects are the heart of every Module.

Examples:

Documents

- Passport
- Driver Licence
- Birth Certificate

Finance

- Account
- Investment
- Loan

Health

- Medication
- Appointment
- Medical Record

Objects own their data.

Modules simply display and organise Objects.

---

# Relationships

Relationships provide context.

Examples:

Passport

→ Owner

→ Trip

→ Visa

→ Reminder

Vehicle

→ Insurance

→ Registration

→ Service History

Relationships transform isolated information into connected knowledge.

---

# Activity

Every significant change should generate activity.

Examples:

- Uploaded document
- Reminder completed
- Goal achieved
- Vehicle serviced
- Insurance renewed

Activity answers:

> "What changed?"

---

# Insights

Insights surface useful observations.
Insight Cards as we call it, provides compact, actionable summaries derived from data across Kinesis.
These are present in the homepage and used module knowledge to summery actionable items. 

Each card should answer **“Is there something here I should know?”**

Examples:

- Three documents expire this year.
- No emergency contact is linked.
- This vehicle has not been serviced recently.
- You own three subscriptions with annual renewals next month.

Insights should reduce mental effort.

They should never overwhelm users.

---

# Settings

Each Module may expose configuration relevant to that Module.

Examples:

- Default view
- Templates
- Integrations
- Notifications
- Sharing
- Permissions (future)

---

# System Modules

System Modules may extend the framework.

For example:

Documents may include:

- OCR
- AI extraction
- File preview
- Expiry detection

Finance may include:

- Net worth
- Cash flow
- Investments

Health may include:

- Medications
- Vaccinations
- Appointments

System Modules are allowed to introduce specialised experiences while still respecting the Module Framework.

---

# Custom Modules

Custom Modules follow the same framework.

Users define:

- Name
- Icon
- Colour
- Templates
- Custom fields
- Views

Custom Modules should feel like first-class citizens within Kinesis.

They should not feel like "second-class" plugins.

---

# AI

AI is not a separate Module.

AI exists throughout Kinesis.

Examples include:

- Extract document information.
- Suggest reminders.
- Detect missing information.
- Recommend relationships.
- Generate summaries.
- Answer questions.

AI should appear where it naturally adds value.

Users should not need to think about "using AI."

---

# Design Principles

Every Module should answer the following questions:

### What do I have?

Objects

### What needs attention?

Overview

Insights

Reminders

### What changed?

Activity

Timeline

### How is it connected?

Relationships

### What can I do next?

Toolbar

Actions

AI Suggestions

---

# User Experience Goals

A Module should feel:

- Familiar
- Calm
- Organised
- Informative
- Connected

Users should immediately understand where they are and what deserves attention.

---

# Implementation Guidance

The first implementation of this framework is:

```
Documents
```

Documents will act as the reference implementation for future Modules.

Once the framework has proven successful, it should be reused across:

- Finance
- Health
- Vehicles
- Goals
- Relationships
- Future System Modules
- Custom Modules

---

# Out of Scope

The following are not part of the initial Module Framework:

- Permissions
- Collaboration
- Module sharing
- Advanced dashboards
- AI automation
- Workflow engines

These may be introduced later without changing the framework itself.

---

# Decision Summary

Modules are not independent applications.

Modules are consistent views over connected Objects.

Objects are the source of truth.

Relationships create context.

AI enhances understanding.

The Module Framework ensures every area of life feels familiar while remaining deeply connected to every other area.La
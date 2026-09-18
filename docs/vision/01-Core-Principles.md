# Core Principles

These principles guide every design and engineering decision made in Kinesis.

---

# 1. Everything can be connected

Connectivity is first-class citizens.

Information becomes more useful when relevancy becomes visible.

Objects can relate to multiple objects, goals, people, documents, and reminders.

Knowing that a passport exists is useful.

Knowing:

- who owns it
- what trip depends on it
- when it expires

is significantly more valuable.

---

# 2. Objects Own Data

Kinesis is built around durable things: people, documents, goals, accounts, vehicles, decisions, subscriptions, and anything else worth remembering.

Objects are the foundation of Kinesis.

Objects can participate across Kinesis without being duplicated.

> Objects are the shared identity layer, not the shared business-logic layer.

A Goal remains a Goal.
A Document remains a Document.
A Person remains a Person.

Their domain-specific data and behaviour stay where they belong.


---

# 3. Modules Organize; They Do Not Define Everything

Modules group and present Objects in ways that make sense for a particular area of life.

System Modules may provide specialised behaviour that's not available in Custom Modules, because some domains require purpose-built features.

That is why System Modules exist. They should not be forced into a generic mould purely for architectural consistency.

But that specialisation does not confine the underlying Object.

An Object can appear in multiple contexts, participate in shared Kinesis capabilities, and influence other parts of the system independently of the Module that presents it.

**Passport**

May appear in:

* Documents
* A Travel Goal
* A Visa Goal
* Calendar
* Search
* Upcoming & Due
* Timeline

while remaining one Object.

Objects can transcend Modules.

---

# 4. Privacy and Security Are Foundational

Kinesis holds deeply personal information.

Security should be treated as a core design constraint, not a feature added later.

Kinesis should:

* minimize unnecessary exposure of personal data
* enforce ownership and authorization consistently
* protect against common web attack surfaces
* make destructive actions explicit and complete
* avoid retaining data the user has asked to delete
* keep tightening its security posture as the product grows


---

# 5. Data Must Be Trustworthy

Kinesis stores information that can matter for years.

Passports, finances, relationships, goals, dates, and personal records should never be silently lost, overwritten, cross-linked to the wrong owner, or corrupted without detection.

Kinesis should prefer explicit conflict handling, strong ownership boundaries, referential integrity, and change history.

> If Kinesis is unsure whether an edit is safe, it should fail clearly rather than silently overwrite or corrupt data.

---

# 6. Search is Universal

Users should not need to remember where something lives.

If it exists in Kinesis, it should be discoverable.

Navigation reflects structure.

Search transcends it.

---

## 7. Surface What Needs Attention — Hold the Rest

Kinesis should not treat every unresolved item as something the user needs to think about right now.

It should also provide focused views that help users understand different kinds of attention across their life and within specific Modules.

Where useful, Kinesis should distinguish between things that:

- Urgent now 

- Reminder before it becomes urgent 

What appears in each view should be thoughtful, relevant, and explainable.

Users should have some control over what Kinesis surfaces and how different kinds of urgency are presented.

When something does need attention, Kinesis should make the next action easy to understand and easy to take.

The goal is show things thoughtfully and appropriately. 


---

# 8. Prefer Deterministic Intelligence

If Kinesis can derive something reliably from structured information, it should do so directly.

AI can be used to enhance the system where ambiguity or language understanding is useful, not replace deterministic logic unnecessarily.

- Extract information
- Connect related information
- Suggest actions
- Answer questions

The user always remains in control.

---

# 9. Enter Information Once

Kinesis should not make users repeatedly describe the same thing.

Once information exists, it should be reusable across:

* modules
* links
* reminders
* calendar
* search
* timeline
* dashboards
* future intelligence

References should stay live whenever possible instead of copying data.

User will still be responsible for referencing. 

---

## 10. Low Friction, Helpful Anticipation

Kinesis should make important life-admin work easier to start, easier to maintain, and easier to understand.

Reduce unnecessary steps wherever possible.

Make use of connections, and relevant context to help user. 

Examples include:

* suggesting related Objects
* pre-filling known information
* surfacing a dependency the user may have missed
* offering a To-Do when an important date may require action
* making reminders and notification clickable to see relevant objects

Helpful anticipation should support the user, not take control away from them.

> **Low friction and helpful anticipation are not destinations. They are qualities Kinesis should keep earning through continuous refinement.**


---

# 11. Integrate Before Replacing

Dedicated applications should continue doing what they do best.
Kinesis is not: 

- A budgeting application
- A password manager
- A medical records system
- A CRM
- A dedicated note-taking application
- A calendar application

Kinesis is faithful to it's role, it can however work towards integrating other application.  
But it does not need to replace the user's existing tools.

If another product serves a particular need better, the user should use it.

Kinesis earns its place by doing one job exceptionally well:

> **Keeping the important administrative parts of life connected, remembered, and under control.**


---

# 12. Build for Longevity

Life-admin information may remain relevant for years.

Kinesis should prefer:

* stable concepts
* traceable history
* portable information
* safe behaviour

over short-lived novelty.

Features should remain useful for many years.

Avoid trends and unnecessary complexity.

---

# 13. Simplicity Wins

Power should come from connected concepts, not an endless number of features.

Every feature has a cost, therefore add complexity when it creates meaningful value.

When two solutions work equally well, choose the simpler one.

---
**Version:** 0.2
**Last Updated:** September 2026
**Status:** Draft
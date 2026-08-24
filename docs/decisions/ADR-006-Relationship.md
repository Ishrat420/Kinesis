# Relationship MVP — Implementation Brief

## Status

Accepted

---

## Context

Relationships are an important area of life administration but do not fit naturally into a traditional list or task-based interface.

Kinesis should help users represent the people in their life, understand how those people are connected, and intentionally maintain relationships without treating people like tasks or CRM records.

Relationships is also about relationship stewardship. Not “who is this person?” but what does this relationship need to stay healthy, meaningful, and intentional. 

Each relationship can optionally have its own care plan, maintenance layer without forcing every relationship into one. You also have the same features when it comes to relationship with yourself, you can add those layers for yourself. 

And I think that actually clarifies what this module fundamentally is. It isn't conceptually “People I have relationships with.” It's more about the relationships in our life that we want to be intentional about, including my relationship with myself.

## Realtionship Page

The Relationships module will use a **constellation-style interface**.

### People

Each person is represented as a movable bubble.

A person can have:

* Name
* Category
* Icon
* Colour
* Bubble size
* Position
* Connections to other people

One `Person` represents the user themselves using `isSelf`.

Bubble size and position are user-defined and **do not imply importance**.

### Relationships

A connection between two people represents a `Relationship`.

A relationship can contain:

* Relationship type
* Connection practices
* Reflections
* Important dates
* Notes
* Linked goals

Clicking a **person bubble** opens Person details.

Clicking a **connection line** opens Relationship details.

People may exist without a connection, and relationships can be created using **Connect** from a person's details.

### Connection Practices

Connection practices represent ongoing ways of maintaining a relationship rather than goals or one-off tasks.

Examples:

* Date night every Friday
* Call Mum weekly
* Monthly relationship check-in

Recurring reminders may later integrate with the shared Kinesis reminder system.

### Relationship with Self

The user's own Person can contain a dedicated **Relationship with myself** area for:

* Connection practices
* Reflections
* Linked goals

This does not create a self-to-self Relationship record.

### Linked Goals

Relationships can link to existing Goals.

Example:

> **Relationship:** User ↔ Person 1 
> **Linked goal:** Foster a stronger relationship

Goals remain owned by the Goals module; Relationships only reference them.


### Customisation

There are many customization we can make visually that is just for our view: 

* drag bubbles anywhere
* resize bubbles
* connect people
* remove connections
* choose bubble colour
* maybe choose connection style later
* zoom/pan the canvas
* save positions
* reset/auto-arrange

But size and position does not have any meaning when it comes to the code, it's just for our own view. 

This also gives Relationships something none of other modules currently have:

**Documents → information/list-oriented**
**Finance → dashboard-oriented**
**Goals → progress-oriented**
**Relationships → spatial/connection-oriented**

And underneath, they're still using the same Kinesis philosophy: **objects + relationships + shared capabilities**, while the module chooses the visualization that best represents that part of life.

## Data Model

Core models:

```text
Person
Relationship
ConnectionPractice
RelationshipReflection
RelationshipImportantDate
RelationshipGoal
```

A `Relationship` connects exactly two `Person` records. Duplicate and self-connections are not permitted.

## Future Considerations

* Multiple constellation views
* Shared recurring reminder system
* Kinesis Links replacing relationship-specific goal linking
* Additional relationship insights and maintenance tools

# ADR-008: Authentication, Single-User Access, and User Ownership

## Status

Accepted

## Context

Kinesis stores personal documents, financial information, goals, relationships,
settings, reminders, and activity. Authentication therefore needs to do more than
show a login form: it must establish a trusted external identity, decide whether
that identity may use a deployment, map it to a stable local user, and ensure every
data access stays inside that user's ownership boundary.

The initial database was built around a fixed user ID of `current`. That was useful
while Kinesis had no authentication, but it coupled the persistence model to the
assumption that only one user could ever exist. Conversely, immediately supporting
public registration, multiple users, invitations, roles, organizations, or shared
records would add product and security complexity that the current private product
does not need.

Kinesis consequently needs a deliberate middle ground: the deployed product is
restricted to one explicitly selected person, while the database uses ordinary
generated user IDs and owner-scoped records so that the schema does not encode the
temporary product limit.

## Decision

Kinesis is a **single-user product with a multi-user-capable schema**.

The authentication and ownership model is split into four distinct responsibilities:

1. **Authentication:** Clerk establishes the browser session and supplies the
   authenticated Clerk user ID.
2. **Deployment access policy:** `KINESIS_OWNER_CLERK_USER_ID` identifies the only
   Clerk account permitted to use this Kinesis deployment.
3. **Local identity:** Prisma stores a Kinesis `User` with a generated UUID and a
   unique `clerkUserId` mapping. The Clerk ID is not the database primary key.
4. **Authorization:** every top-level personal-data record belongs to the local
   Kinesis user through `userId`; reads and writes must resolve the authenticated
   local user and include that ownership boundary.

Public sign-up, a second user, invitations, organizations, roles, and record
sharing are explicitly out of scope. Supporting any of them later is a product and
authorization change, not an environment-variable configuration exercise.

## Technology choices

### Clerk

Kinesis uses `@clerk/nextjs` as the managed identity and session provider. Clerk
owns credential collection, password or other configured sign-in methods, session
cookies, session validation, sign-out, and its account-management interface.

The application uses:

- `ClerkProvider` at the root layout to make Clerk session context available;
- Clerk's path-routed `SignIn` component at `/sign-in`;
- `clerkMiddleware`, `createRouteMatcher`, and `auth.protect()` at the request
  boundary;
- server-side `auth()` and `currentUser()` to resolve and cross-check the active
  identity; and
- Clerk's `UserButton` for sign-out and account-management access.

Kinesis does not store passwords, password hashes, or Clerk session tokens in its
database.

### Next.js

Kinesis uses the Next.js App Router and the Next.js 16 `proxy.ts` convention for
the first request-level access check. Pages, Route Handlers, and Server Actions
also rely on the server-side Kinesis user guard rather than treating proxy checks
as sufficient authorization by themselves.

### Prisma and PostgreSQL

Prisma is the application data-access layer and PostgreSQL is the persistent store.
`User.id` and `UserSettings.id` use Prisma-generated UUIDs. `User.clerkUserId` is a
unique, nullable external-identity mapping; it remains nullable so migrated local
data can exist before the configured owner first authenticates.

Top-level personal-data models carry a required `userId` foreign key. Foreign keys
delete owned data on local-user deletion. The migration away from `current` changes
the legacy primary key to a UUID and relies on existing `ON UPDATE CASCADE`
constraints to preserve all ownership relationships.

## Request and authorization flow

### Public and separately authenticated routes

The sign-in route is public so an unauthenticated owner can establish a Clerk
session. Static assets and Next.js internals are excluded by the proxy matcher.

`/api/notifications/evaluate` is also excluded from Clerk session enforcement
because it is invoked as a scheduled server-to-server job. It is not anonymous:
the Route Handler fails closed when `CRON_SECRET` is missing and requires an exact
`Authorization: Bearer <CRON_SECRET>` header before evaluating notifications.

No other application or API route is intentionally public.

### Proxy boundary

For a protected request, `proxy.ts` applies these rules:

1. An unauthenticated page request is redirected to `/sign-in`.
2. An unauthenticated API request is handled by `auth.protect()`.
3. An authenticated request receives `503 Service Unavailable` if
   `KINESIS_OWNER_CLERK_USER_ID` is absent. The deployment fails closed rather than
   allowing the first account to claim it.
4. An authenticated Clerk identity that does not match the configured owner
   receives `403 Forbidden`.
5. Only the matching configured owner proceeds to the application.

This blocks arbitrary first-user provisioning at the earliest application boundary.

### Server-side identity guard

`requireKinesisUser()` is the authoritative data-access guard:

1. `auth()` must return a Clerk user ID.
2. `currentUser()` must return the same identity.
3. That ID must equal `KINESIS_OWNER_CLERK_USER_ID`.
4. The Clerk account must have a primary email address.
5. Kinesis looks up the local user by the unique `clerkUserId`.
6. If found, Kinesis synchronizes first name, last name, and email when they have
   changed.
7. If no mapping exists, a transaction either binds the sole existing migrated
   local user or creates a new UUID-backed user for a fresh database.
8. If more than one unmapped local user exists, provisioning fails rather than
   guessing which record owns the deployment.

React's server `cache()` deduplicates repeated identity resolution during one
render. It is a request/render optimization, not a persistent session or an
authorization cache.

### Data ownership

The local UUID returned by `requireKinesisUser()`—not the configured Clerk ID—is
the value used in application ownership filters. Top-level queries and mutations
must include `userId: user.id`. Child records without their own `userId` must be
authorized through a parent relation that belongs to the same user.

This rule applies even while only one product user is allowed. The single-user
access policy must never be used as a reason to omit ownership checks. Exports,
search, notifications, destructive actions, and background processing are all
additional data paths that must preserve the same boundary.

## Provisioning and existing-data migration

There is no public registration flow in Kinesis. The operator creates or selects
the owner in Clerk, copies its `user_...` ID, configures
`KINESIS_OWNER_CLERK_USER_ID`, and deploys the application. Enabling registration
in the Clerk tenant does not grant Kinesis access to another account because the
application-level owner check remains authoritative.

The generated-ID migration converts only the legacy IDs equal to `current`:

- the legacy `User.id` becomes a generated UUID;
- ownership foreign keys follow it through `ON UPDATE CASCADE`;
- the legacy `UserSettings.id` becomes a generated UUID; and
- fixed database defaults are removed because Prisma Client supplies UUIDs for new
  records.

The migration preserves the local user's Clerk mapping when it already exists. If
the legacy user is still unbound, the first request from the configured Clerk owner
binds that existing generated-ID user rather than creating an empty replacement.

## Owner replacement and recovery

The local Kinesis user is deliberately separate from the Clerk identity. This
allows the operator to recover from a deleted, disabled, or inaccessible Clerk
account without changing the local user ID or losing its related data.

Recovery is currently operator-controlled:

1. Create or select the replacement Clerk user and ensure it has a primary email.
2. Change `KINESIS_OWNER_CLERK_USER_ID` in every deployment environment.
3. Restart or redeploy all application instances.
4. Sign in as the replacement owner.
5. Kinesis updates the sole local user's `clerkUserId` and profile fields inside a
   transaction while retaining the local UUID and owned records.

Changing this environment variable grants access to all data in the deployment.
Permission to edit deployment configuration must therefore be restricted and
audited by the hosting platform. All simultaneously running instances must use the
same owner value during a rotation.

Kinesis does not yet use a Clerk webhook. Recovery does not depend on one, although
a signature-verified webhook may later provide proactive lifecycle synchronization
and monitoring.

## Profile synchronization

Clerk is authoritative for the account's first name, last name, primary email, and
remote account image. Kinesis synchronizes the stored name and email during an
authenticated request. The optional Kinesis `preferredName` remains local product
data.

Documents also store a display-oriented owner name. When the synchronized or
replacement owner's effective display name changes, Kinesis updates documents that
still use the previous automatic owner name (or the legacy `user` value). This
keeps presentation consistent without changing ownership, which remains based on
`userId`.

## Alternatives considered

### First authenticated user claims the deployment

Rejected. A public sign-in surface plus a permissive Clerk tenant could allow an
unintended valid account to claim a new deployment and any migrated data before the
intended owner arrives.

### Fixed local user ID of `current`

Rejected as the permanent model. It makes a temporary single-user product limit a
database invariant, complicates future isolated-user support, and obscures the
difference between product policy and record ownership.

### Use the Clerk user ID as the database primary key

Rejected. A generated local ID keeps persistence independent of the identity
provider and allows owner rotation without rewriting every owned record.

### One environment variable per allowed user

Rejected. Environment variables are appropriate for selecting the one deployment
owner, not for user provisioning or membership management. Additional users would
require a database-backed provisioning policy and explicit authorization design.

### Public multi-user registration now

Deferred. The schema is capable of representing isolated owners, but safe product
support also requires registration policy, lifecycle behavior, user-facing flows,
cross-user authorization tests, and decisions about sharing and administration.

### Custom password and session implementation

Rejected. A managed identity provider reduces the amount of sensitive credential
and session infrastructure Kinesis must implement and maintain.

## Consequences

### Positive

- A deployment cannot be claimed by an arbitrary first authenticated account.
- Only one explicitly configured Clerk identity can use the product today.
- Passwords and sessions remain managed by Clerk rather than Kinesis.
- Local UUIDs decouple stored ownership from Clerk and make owner recovery possible.
- Existing legacy data is preserved during the generated-ID migration.
- Owner-scoped schema and query patterns avoid hardcoding the current product limit
  into new data models.
- A future multi-user product can build on the local ownership model rather than
  first replacing `current` throughout the database.

### Negative and operational

- Every environment must configure `KINESIS_OWNER_CLERK_USER_ID`; otherwise
  protected requests deliberately return 503.
- Changing the configured owner is a highly privileged operation that grants full
  access to the deployment's data.
- Owner recovery currently requires an operator and redeployment.
- Clerk dashboard configuration remains part of the security boundary, including
  enabled sign-in methods and registration policy.
- Profile changes synchronize on the next authenticated request rather than by
  webhook.
- The application still repeats ownership predicates across data-access functions,
  which creates regression risk if a future query omits one.

## Required environment configuration

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`: Clerk's browser-safe publishable key.
- `CLERK_SECRET_KEY`: Clerk's server-only secret key.
- `KINESIS_OWNER_CLERK_USER_ID`: the only Clerk user ID allowed to access this
  deployment.
- `DATABASE_URL`: PostgreSQL connection used by Prisma.
- `CRON_SECRET`: bearer credential for scheduled notification evaluation.

Secrets must not be exposed through `NEXT_PUBLIC_` variables. Preview and
production deployments need consistent owner configuration when both should be
usable.

## Follow-up work

The following are not part of the accepted baseline and remain explicit follow-up
work:

- automated proxy tests for redirect, 401, 403, and missing-configuration 503 paths;
- provisioning and concurrency tests for fresh, migrated, rotated, and invalid
  owner states;
- cross-user fixture tests for every ID-based read, mutation, export, search, and
  destructive operation;
- typed authentication, authorization, and provisioning errors with appropriate UI
  and HTTP translations;
- recent-authentication or step-up checks for full export and bulk deletion;
- a Clerk deployment checklist covering registration, verification, session policy,
  origins, redirects, and key rotation;
- a signature-verified Clerk lifecycle webhook and security-event audit trail; and
- a separate ADR before enabling additional users, invitations, organizations,
  roles, or sharing.

Until those product decisions are made, public signup and additional-user access
must remain disabled even though the local schema can represent more than one user.

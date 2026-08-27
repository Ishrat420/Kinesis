# Authentication and authorization audit

**Reviewed:** 2026-08-27
**Scope:** Clerk integration, route protection, Kinesis user provisioning, data
ownership checks, privileged endpoints, account lifecycle, operational guidance,
and automated verification.

## Executive summary

The current implementation has a sound authentication boundary for the normal
application path: Clerk manages sessions, the Next.js proxy protects application
and API routes, server-side data access resolves the signed-in Clerk identity,
and top-level records are generally filtered by the resolved Kinesis user ID.

The two highest-priority findings from the initial review have now been addressed.
The application requires an explicitly configured Clerk owner ID before it binds
or returns the generated local owner, and changing that configuration provides an
operator-controlled recovery path that preserves existing data.

Other lifecycle controls remain incomplete. There is no Clerk webhook and no
explicit sign-up page even though sign-up is an MVP requirement. Authentication
verification now follows the repository's intentionally layered testing strategy:
stable server behavior is covered by unit and database-backed integration tests,
while browser and external Clerk lifecycle behavior is covered by a repeatable
production-like manual test plan. Browser automation is not required for this
finding to remain resolved. The review also previously found that relationship
updates could link an owned relationship to another user's goal when given that
goal's ID; that gap is now closed.

Sensitive data export and bulk deletion now require a first-factor verification
no more than ten minutes old. Bulk deletion also requires an exact server-checked
confirmation phrase, and both successful operations write content-free security
events. Deployment guidance, credential-rotation procedures, and a safe environment
variable template have also been added, although the production Clerk settings are
not yet finalized.

## What is already in place

- `proxy.ts` makes only the sign-in screen and the separately authenticated cron
  endpoint public. Unauthenticated page requests are redirected and API requests
  use Clerk's protection response.
- `requireKinesisUser()` obtains the session identity from Clerk, checks it against
  `currentUser()`, requires a primary email, and maps the external identity to the
  local user.
- The owner binding uses a transaction and only accepts the configured Clerk owner,
  which prevents competing authenticated identities from claiming the instance.
- The Prisma model associates all top-level personal-data domains with a user, and
  the reviewed reads and mutations normally include either `userId` or an
  ownership condition through a parent relation.
- The data-export endpoint authenticates the caller, scopes each exported domain,
  omits `clerkUserId`, and disables response caching.
- The notification evaluator fails closed when `CRON_SECRET` is absent and checks
  its bearer credential before processing all users.
- Clerk's `UserButton` supplies the normal sign-out/account-management surface.
- Vitest coverage now verifies the principal proxy status paths, configured-owner
  checks, concurrent initial provisioning behavior, export scoping, and cron
  authentication.
- Sensitive export and bulk-deletion operations use Clerk reverification on both
  the client flow and server boundary; deletion additionally checks an exact
  confirmation phrase on the server.
- Successful exports and bulk deletions create minimal, owner-scoped security
  events without recording exported or deleted content.
- A manual security runbook covers anonymous access, owner and non-owner login,
  missing owner configuration, sign-out, session revocation and expiry, concurrent
  windows, browser history, cookie posture, and redirect safety.

## Findings and gaps

### Resolved P0 — First authenticated account could claim an unprovisioned instance

The proxy and `requireKinesisUser()` now fail closed unless
`KINESIS_OWNER_CLERK_USER_ID` is configured and the authenticated Clerk ID matches
it. Only that pre-provisioned identity can reach protected routes or bind/load the
generated local owner, so an arbitrary valid Clerk account can no longer claim a
fresh instance.

The README documents the required server environment and recommends disabling
public Clerk registration for this single-owner application. Unit tests cover
missing configuration and mismatched identities. Database-backed integration
tests additionally cover fresh-instance rejection and provisioning, migrated
owners, owner rotation with retained data, ambiguous owners, and concurrent first
requests.

Status: Functionally resolved with unit and database-backed integration coverage.

### Resolved P1 — Deleted or replaced Clerk accounts left the instance locked

The configured owner ID is now the authority for the single-owner binding. An
operator can replace a deleted or inaccessible Clerk identity by changing
`KINESIS_OWNER_CLERK_USER_ID` and restarting or redeploying all instances. On the
replacement owner's first request, the transaction updates the existing local user
record in place, preserving its generated ID and all related data.

The recovery procedure and its security implications are documented in the README.
A signature-verified Clerk webhook may still be useful for prompt profile syncing
and monitoring, but recovery no longer depends on receiving a deletion webhook.

Status: Operationally resolved but an operator need to change the configured Clerk owner ID and preserve the existing data.

### Resolved P1 — Relationship updates did not verify linked-goal ownership

`saveRelationshipMap()` now deduplicates all client-supplied linked-goal IDs and,
inside the same transaction, verifies that every referenced goal belongs to the
authenticated local user. If any ID is missing or belongs to another user, the
action rejects the complete update before deleting or recreating relationship
data. A regression test confirms that an unowned goal prevents all mutations.

Status: Functionally resolved and covered by a cross-user authorization unit test.

### Resolved P1 — Authentication security coverage needed a lifecycle strategy

The repository now tests page redirects, API 401 responses, public proxy
exceptions, missing/mismatched owner configuration, database-backed initial owner
provisioning and rotation (including real concurrent requests), export isolation,
cron-secret behavior, and database-backed cross-user isolation for the current
document, goal, finance, custom-module, notification, and relationship action
surfaces. The cross-user contract includes full goal-milestone and custom-item
parent/child mismatch matrices. Session-expiry rejection also has unit coverage.

Sign-out and the external Clerk/browser lifecycle are deliberately verified using
the committed manual lifecycle security plan rather than Playwright or another
browser automation framework. The plan supplies repeatable production-like checks
for sign-out, revocation/expiry, concurrent windows, browser history, cookie posture,
and redirect safety. This is the accepted coverage layer for those workflows, not
an outstanding requirement to introduce browser automation.

**Ongoing requirement:** Run and retain evidence from the manual lifecycle plan
before authentication, Clerk, proxy, cookie, domain, or session-policy releases.
Keep every new ID-based read/write in the shared cross-user contract, and consider
centralizing owned-record lookups to reduce repeated authorization predicates.

Status: Resolved through layered unit, database-backed integration, and repeatable
manual lifecycle coverage. Browser automation is not planned or required; failure
to execute the manual plan for a relevant release would reopen the verification gap.

### P1 — Sign-up is required by the backlog but is not an explicit product flow

The backlog lists sign-up as an initial requirement, but the application exposes
only a `<SignIn>` route and deliberately hides Clerk footer actions. Whether a user
can create an account is therefore implicit in external Clerk configuration rather
than represented and tested in the application. This also conflicts with the
single-owner security model unless registration is invitation-only.

**Recommended action:** Decide and document one of two policies: (1) single-owner,
invitation/pre-provisioning only, and revise the requirement; or (2) supported
sign-up, with an explicit Clerk `<SignUp>` route and a real multi-user ownership
model. Do not enable general sign-up while retaining first-user-wins provisioning.

### Resolved P1 — Schema and provisioning now reflect the tenancy decision

Kinesis is explicitly a single-user product with a multi-user-capable schema.
`User` and `UserSettings` now receive generated local IDs, the configured Clerk ID
is an access policy rather than a database primary key, and provisioning reuses the
sole local user without relying on `current`. All top-level personal data remains
scoped by `userId`.

The migration replaces legacy `current` user/settings IDs while foreign-key
`ON UPDATE CASCADE` constraints preserve existing ownership relations. Supporting
additional users remains a separate product decision that requires provisioning
policy and comprehensive isolation tests.

Status: Architecture decision recorded, technical migration completed

### P2 — Authentication failures do not have a consistent application response

The data-layer guard throws generic `Error` objects for a missing session, missing
primary email, and owner conflicts. Middleware normally intercepts a missing
session, but direct server-function execution, session races, or account-data
problems can surface as unclassified 500 errors rather than a redirect, 401/403,
or actionable user-facing state.

**Recommended action:** Use typed authentication, authorization, and provisioning
errors. Translate them at page/action/route boundaries without disclosing account
details. Add dedicated error UI for missing verified primary email and ownership
conflicts.

### Resolved P2 — Sensitive operations lacked recent-authentication controls

“Delete all data” and full JSON export now require Clerk first-factor
reverification when the current verification is more than ten minutes old. The
client flows invoke Clerk's reverification UI, while the Server Action and Route
Handler independently enforce the requirement. Bulk deletion also requires the
exact `DELETE ALL MY DATA` phrase at the server boundary before any mutation.

Successful export and deletion operations create minimal `SecurityEvent` records
without exported content, deleted content, credentials, or tokens. Unit tests cover
the verification challenge, export rejection, confirmation rejection, and event
creation paths.

Status: Functionally resolved with server-side enforcement and unit coverage.

### Partially resolved P2 — Clerk deployment and security configuration

The repository now includes a Clerk deployment document describing the current
development authentication methods, email verification, authorization behavior,
session policy, known origin/redirect gaps, production checklist, and secret
management. It also includes a names-only `.env.example` and a separate credential
and owner-rotation procedure.

The production Clerk instance, domain, trusted origins, redirect URLs, session
lifetime, MFA policy, password policy, account-deletion behavior, and production
reverification exercise are explicitly still pending. Required variables are not
validated centrally at startup/build time, and the configuration document's
reverification section still describes the now-implemented application flow as
planned.

**Recommended action:** Finalize and record the production dashboard values, update
the configuration document after exercising reverification in a production-like
environment, and validate required environment variables at startup/build time.

Status: Documentation and safe variable/rotation templates now exist; production
configuration and automated environment validation remain open.

### Partially resolved P2 — No webhook-backed profile synchronization; audit trail is limited

Name/email changes are copied into Kinesis only on the next authenticated request.
There is still no Clerk webhook and no record of owner claims, rejected claims,
sign-ins, ownership changes, or webhook events. Successful exports and bulk
deletions are now recorded in a dedicated `SecurityEvent` model, but the events are
deleted with their owning user, have no recorded metadata or retention policy, and
do not constitute a tamper-resistant audit log. Existing activity records remain
product activity rather than security events.

**Recommended action:** Verify Clerk webhook signatures and synchronize supported
identity changes asynchronously. Extend privacy-conscious security event coverage
to the remaining lifecycle events and define retention, integrity, and access
rules; never log session tokens, bearer secrets, or exported personal data.

Status: Export and bulk-deletion success events are recorded; webhook synchronization
and a comprehensive, durable security audit trail remain open.

## Suggested delivery order

1. **Maintain isolation coverage:** keep provisioning/rotation, IDOR attempts, and
   Server Actions in the unit and database-backed integration contracts, and run
   the manual lifecycle plan for relevant authentication releases.
2. **Finish sensitive-action hardening:** recent-authentication checks, server-side
   deletion confirmation, and minimal export/deletion events are implemented; add
   typed errors and define security-event retention and integrity controls.
3. **Complete lifecycle integration:** add verified webhooks for proactive identity
   synchronization and security monitoring.
4. **Make operation repeatable:** finalize the documented production Clerk values,
   add startup/build-time environment validation, and reconcile the backlog with
   the chosen tenancy and registration policy.

## Audit limitations

This was a static repository review. Clerk dashboard settings, deployed environment
variables, production headers/cookies, session policy, email verification policy,
and runtime behavior were not available in the repository and must be validated in
the deployed environment. Dependency vulnerability and penetration testing are
also outside this review.

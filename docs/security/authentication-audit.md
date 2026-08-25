# Authentication and authorization audit

**Reviewed:** 2026-08-25
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

Other lifecycle controls remain incomplete. There is no Clerk webhook, no explicit
sign-up page even though sign-up is an MVP requirement, and no automated
authentication or authorization tests.

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

## Findings and gaps

### Resolved P0 — First authenticated account could claim an unprovisioned instance

The proxy and `requireKinesisUser()` now fail closed unless
`KINESIS_OWNER_CLERK_USER_ID` is configured and the authenticated Clerk ID matches
it. Only that pre-provisioned identity can reach protected routes or bind/load the
generated local owner, so an arbitrary valid Clerk account can no longer claim a
fresh instance.

The README documents the required server environment and recommends disabling
public Clerk registration for this single-owner application. Automated tests for
missing configuration, mismatched identities, and concurrent requests are still
required under the separate testing finding below.

Status: Functionally resolved and implemented. Manually tested for now. But will need automation tests. 

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

### P1 — No automated tests cover the security boundary

The repository has no test suite for the proxy, owner claim, server actions, API
responses, or cross-user access. The authorization checks are repeated manually
across many Prisma calls, so a future query can omit a user predicate without a
test detecting the regression.

**Recommended action:** Add tests for unauthenticated page redirects and API 401s,
the public sign-in and cron exceptions, first-owner concurrency, rejected second
users, every ID-based read/write using another user's fixture, export isolation,
sign-out/session expiry, and cron-secret failure cases. Consider centralizing
owned-record lookups to reduce repetition.

Status: Need to use vitest to test some of this. 

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

### P2 — Destructive operations have no recent-authentication requirement

“Delete all data” and full JSON export rely on the existing session only. They do
not request step-up/reverification, and delete-all has only a client-side
confirmation. An unattended or stolen authenticated browser session can therefore
export or destroy all personal data immediately.

**Recommended action:** Require recent Clerk verification for export and destructive
operations, add server-enforced confirmation for deletion, and record security
events without logging exported content.

### P2 — Clerk deployment and security configuration is undocumented

The README documents the database and cron secret but not Clerk publishable/secret
keys, allowed origins/redirects, production instance configuration, enabled sign-in
methods, registration policy, email verification, session lifetime, or key
rotation. These external settings determine important parts of the actual security
posture.

**Recommended action:** Add a deployment checklist and an `.env.example` containing
names only. Pin down the expected Clerk dashboard settings and validate required
environment variables at startup/build time.

### P2 — No webhook-backed profile synchronization or audit trail

Name/email changes are copied into Kinesis only on the next authenticated request.
There is no record of owner claims, rejected claims, sign-ins, exports, bulk
deletions, ownership changes, or webhook events. Existing activity records are
product activity rather than a tamper-resistant security log.

**Recommended action:** Verify Clerk webhook signatures and synchronize supported
identity changes asynchronously. Add privacy-conscious security event logging with
retention and access rules; never log session tokens, bearer secrets, or exported
personal data.

## Suggested delivery order

1. **Prove isolation:** establish integration tests around proxy behavior, owner
   claiming, IDOR attempts, export, cron authentication, and session expiry.
2. **Harden sensitive actions:** add recent-authentication checks, server-side
   confirmation, typed errors, and security events.
3. **Complete lifecycle integration:** add verified webhooks for proactive identity
   synchronization and security monitoring.
4. **Make operation repeatable:** expand the Clerk deployment checklist and
   reconcile the backlog with the chosen tenancy and registration policy.

## Audit limitations

This was a static repository review. Clerk dashboard settings, deployed environment
variables, production headers/cookies, session policy, email verification policy,
and runtime behavior were not available in the repository and must be validated in
the deployed environment. Dependency vulnerability and penetration testing are
also outside this review.

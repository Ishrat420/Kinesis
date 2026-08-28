# ADR-009: Invite-Only Multi-User Access

## Status

Accepted; supersedes ADR-008's single-user product limit while retaining its
identity separation and owner-scoped authorization requirements.

## Decision

Kinesis supports multiple users with isolated data, but not public registration.
The Clerk identity configured by `KINESIS_OWNER_CLERK_USER_ID` is the deployment
owner. Only that local `OWNER` may manage access.

The owner sends application invitations from Settings. Kinesis asks Clerk to send
the invitation email and stores the normalized invited email and Clerk invitation
ID locally. On the recipient's first authenticated request, Kinesis requires a
live, unaccepted, unrevoked local invitation matching the Clerk primary email. In
one database transaction it creates the local `MEMBER` and consumes the
invitation. An arbitrary authenticated Clerk account is rejected.

Existing and new members have `ACTIVE` or `REVOKED` status. Revocation blocks
access but deliberately retains owned records so an owner can restore access.
Pending invitations can also be revoked. Disabling public sign-up in Clerk is an
additional required deployment control; the application-level membership check
continues to fail closed independently of that setting.

Every personal-data query remains scoped to the authenticated local `User.id`.
There is no record sharing, organization, or ability for an owner to browse a
member's personal records. Administration controls access only.

## Consequences

- An environment variable is not needed for every member.
- Clerk continues to own credentials, sessions, and invitation delivery.
- The application database is authoritative for Kinesis membership and status.
- The server-only Clerk key can create and revoke invitations and must be protected.
- Owner replacement remains operator-controlled through
  `KINESIS_OWNER_CLERK_USER_ID`.

# Clerk Authentication & Deployment Configuration

This document records the expected Clerk configuration for Kinesis.

Authentication features are intentionally introduced incrementally so that each
security control can be tested before additional controls are enabled.

## Environment Model

| Environment                 | Clerk environment | Status             |
|-----------------------------|-------------------|--------------------|
| Local development           | Development       | Active             |
| Vercel Dev Preview branch   | Development       | Active             |
| Vercel Dev `main`           | Production        | Active             |
| Personal production         | Production        | Active             |

The Dev production Clerk instance is configured for `https://thekinesis.com` and
uses Google as its social SSO provider. The production sign-in flow has been
tested successfully.


### Clerk Frontend API proxying

Frontend API proxying is opt-in and controlled by
`CLERK_FRONTEND_API_PROXY_ENABLED`. Set it to the exact value `true` only for the
personal production deployment that uses Clerk production (`pk_live_...` /
`sk_live_...`) keys. Local development and dev preview deployments
use Clerk development keys and must leave the variable unset or set it to
`false`. Missing values default to disabled.

The `/__clerk/(.*)` Next.js proxy matcher remains in the static matcher list
because Next.js requires matcher values to be statically analyzable. Clerk only
handles those Frontend API proxy requests when the environment variable enables
the `frontendApiProxy` middleware option.


## Authentication

Current authentication methods:

| Setting                       | Current configuration.       |
|-------------------------------|------------------------------|
| Email sign-up                 | Enabled                      |
| Email required                | Yes                          |
| Email verification at sign-up | Required                     |
| Email verification method     | Verification code            |
| Email sign-in                 | Enabled                      |
| Password sign-up              | Enabled                      |
| Minimum password length       | 15 characters                |
| Compromised password rejection| Enabled                      |
| Minimum password strength     | Disabled                     |
| Additional password rules     | None                         |
| Passkeys                      | Disabled                     |
| Phone authentication          | Disabled                     |
| Username authentication       | Disabled                     |
| Web3 wallet authentication    | Disabled                     |
| Enterprise accounts           | Disabled                     |
| Two-step verification         | Disabled                     |
| Social login / SSO            | Google enabled in production |
| Block email subaddresses      | Enabled in production        |

Device Trust is currently enabled. New-device sign-ins require additional
verification.


## Authorization

Since v1.5.0, a deployment hosts many people, each with their own private
Kinesis (ADR-014). Authentication and authorization are split like this:

- **Clerk decides who can sign in at all.** The instance must run in
  **Restricted sign-up mode** (Clerk Dashboard → Configure → Restrictions →
  Sign-up mode: Restricted), so an account can only be created through an
  invitation. With sign-up left open, anyone who can reach the sign-in page,
  including through Google SSO, can create an account and get their own
  Kinesis.
- **Kinesis lets any signed-in Clerk user in, to their own account only.**
  `proxy.ts` only checks there is a session; `requireKinesisUser` finds or
  creates that person's account. A new identity always gets a new, empty
  account and can never reach anyone else's data (enforced by query scoping,
  proven by `tests/integration/auth/cross-user.test.ts` and
  `isolation-probe.test.ts`).
- **`KINESIS_OWNER_CLERK_USER_ID` marks the one admin**, the person who may
  invite others (`requireKinesisAdmin` in `lib/auth.ts`). It no longer
  decides who gets in. Leaving it unset means nobody is admin; the app still
  works.

Expected behaviour:

| Condition                                  | Behaviour                                    |
|--------------------------------------------|----------------------------------------------|
| No authenticated Clerk session             | Redirect to sign-in (pages) / HTTP 401 (API) |
| Any authenticated Clerk user, first visit  | A new, empty account is created for them     |
| Any authenticated Clerk user, later visits | Their own account, and only theirs           |
| Admin-only action, caller isn't the admin  | Refused ("Forbidden")                        |

**Inviting someone:** Clerk Dashboard → Users → Invitations → Invite, with
their email address. They follow the emailed link, set up their sign-in, and
land in a fresh Kinesis of their own. An in-app invite screen for the admin
can come later.

**Existing Clerk users:** every user already in the Clerk instance can sign in
and get an account, whether or not they were invited through Kinesis.
Review the instance's user list, and remove anyone who shouldn't have access,
before deploying v1.5.0.


## Sessions

Current Clerk session configuration:

| Setting                  | Current configuration |
|--------------------------|-----------------------|
| Maximum session lifetime | 7 days                |
| Inactivity timeout       | Disabled              |
| Multi-session handling   | Disabled              |
| Custom session claims    | None                  |

These values describe the current configuration and will need to be reviewed
for production if this is enough or need to revised.


## Reverification

Sensitive-operation reverification is planned for operations such as:

- data export;
- destructive account/data deletion.

This is not yet considered complete until the relevant application flows and
tests are implemented.


## Redirects and Origins

The production domain is `https://thekinesis.com`. The Google Cloud OAuth client
named `Kinesis dev production`, used by the dev production Clerk SSO connection, has
the following allowlist:

| Google OAuth setting         | Production value                                 |
|------------------------------|--------------------------------------------------|
| Authorized JavaScript origin | `https://thekinesis.com`                         |
| Authorized redirect URI      | `https://clerk.thekinesis.com/v1/oauth_callback` |

The OAuth client ID and client secret are deliberately not recorded in this
public repository. Localhost and Vercel Preview deployments remain development
usage and must use the development Clerk environment rather than expanding the
production OAuth allowlist.

## Webhooks

Kinesis does not currently use Clerk webhooks.

No Clerk webhook signing secret is therefore required.


## Production Requirements

The following production configuration is complete:

- The Clerk production instance and production API keys are configured.
- `CLERK_FRONTEND_API_PROXY_ENABLED=true` is set for personal production and dev production only.
- `KINESIS_OWNER_CLERK_USER_ID` is configured everywhere (since v1.5.0 it
  marks the admin who may invite, not the only person allowed in).

**Required before deploying v1.5.0 or later to any environment:**

- [ ] Restricted sign-up mode is on for that environment's Clerk instance.
- [ ] The instance's existing user list has been reviewed; everyone on it
      will be able to sign in.
- The production domain, Google OAuth origin, and Clerk callback URI are
  allowlisted as recorded above.
- Google SSO is enabled and has been tested successfully in production.
- Email subaddress blocking is enabled for the production SSO connection, so
  aliases such as `owner+alias@example.com` cannot be used to access the
  application.

The remaining security review items are:

- Review session lifetime.
- Decide whether MFA/two-step verification will be required.
- Review password policy.
- Review account deletion behaviour.
- Configure and test reverification for sensitive operations.
- Run authentication unit/integration tests against the production-intended
  configuration before release.


## Secret Management

Secrets must not be committed to Git.

Required environment variable names are documented in `.env.example`.

Secret/key rotation procedure is documented separately.

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

Kinesis currently operates as a single-owner deployment.

Authentication and authorization are deliberately separate:

- Clerk establishes the authenticated identity.
- Kinesis determines whether that identity is authorized to access the
  application.

The authorized Clerk identity is configured using:

KINESIS_OWNER_CLERK_USER_ID

Expected behaviour:

| Condition                                                | Behaviour                               |
|----------------------------------------------------------|-----------------------------------------|
| No authenticated Clerk session                           | Access denied / authentication required |
| Owner configuration missing                              | Fail closed with HTTP 503               |
| Authenticated Clerk user does not match configured owner | HTTP 403                                |
| Authenticated Clerk user matches configured owner        | Access permitted                        |

The owner check is performed server-side and must not rely solely on client-side
route protection.


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
- `KINESIS_OWNER_CLERK_USER_ID` is configured everywhere.
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

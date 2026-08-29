# Clerk Authentication & Deployment Configuration

This document records the expected Clerk configuration for Kinesis.

Authentication features are intentionally introduced incrementally so that each
security control can be tested before additional controls are enabled.

## Environment Model

| Environment             | Clerk environment | Status             |
|-------------------------|-------------------|--------------------|
| Local development       | Development       | Active             |
| Vercel Preview branches | Development       | Active             |
| Main / Production       | Production        | Not configured yet |

The production Clerk configuration will be established when the authentication
implementation is merged into the production branch.

Development configuration must not be assumed to represent the final production
security configuration.

### Clerk Frontend API proxying

Frontend API proxying is opt-in and controlled by
`CLERK_FRONTEND_API_PROXY_ENABLED`. Set it to the exact value `true` only for the
personal production deployment that uses Clerk production (`pk_live_...` /
`sk_live_...`) keys. Local development, custtest, `main`, and preview deployments
use Clerk development keys and must leave the variable unset or set it to
`false`. Missing values default to disabled.

The `/__clerk/(.*)` Next.js proxy matcher remains in the static matcher list
because Next.js requires matcher values to be statically analyzable. Clerk only
handles those Frontend API proxy requests when the environment variable enables
the `frontendApiProxy` middleware option.


## Authentication

Current authentication methods:

| Setting                       | Current configuration |
|-------------------------------|-----------------------|
| Email sign-up                 | Enabled               |
| Email required                | Yes                   |
| Email verification at sign-up | Required              |
| Email verification method     | Verification code     |
| Email sign-in                 | Enabled               |
| Password sign-up              | Enabled               |
| Minimum password length       | 15 characters         |
| Compromised password rejection| Enabled               |
| Minimum password strength     | Disabled              |
| Additional password rules     | None                  |
| Passkeys                      | Disabled              |
| Phone authentication          | Disabled              |
| Username authentication       | Disabled              |
| Web3 wallet authentication    | Disabled              |
| Enterprise accounts           | Disabled              |
| Two-step verification         | Disabled              |
| Social login / SSO            | Disabled              |

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

These values describe the current development configuration and will be reviewed
before production deployment.


## Reverification

Sensitive-operation reverification is planned for operations such as:

- data export;
- destructive account/data deletion.

This is not yet considered complete until the relevant application flows and
tests are implemented.


## Redirects and Origins

No explicit Kinesis redirect/origin policy has been configured yet.

Current development usage includes:

- localhost;
- Vercel Preview deployments.

Redirect and trusted-origin configuration must be reviewed and explicitly
documented before production deployment.

Production domain: NOT YET CONFIGURED.


## Webhooks

Kinesis does not currently use Clerk webhooks.

No Clerk webhook signing secret is therefore required.


## Production Requirements

Before authentication is deployed to production:

- Create/configure the Clerk production instance.
- Configure production Clerk API keys in Vercel.
- Set CLERK_FRONTEND_API_PROXY_ENABLED=true for personal production only.
- Configure KINESIS_OWNER_CLERK_USER_ID for production.
- Configure the production domain.
- Review allowed/trusted origins.
- Review redirect URLs.
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

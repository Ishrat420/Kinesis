# Manual Authentication Lifecycle Security Test Plan

## Purpose and scope

This plan covers the browser-to-Clerk login and logout lifecycle that the Vitest
suites cannot exercise. It verifies authentication, Kinesis's single-owner
authorization boundary, session invalidation, browser history/cache behaviour,
and server-side protection of pages and APIs.

Run the complete plan before an authentication, Clerk, proxy, cookie, domain, or
session-policy change is released. Run the production-domain checks against a
production-like staging deployment; do **not** use real production user data.

## Security rules for execution

- Use a dedicated Clerk test/development instance, staging deployment, and test
  database. Never change the production owner ID merely to run this plan.
- Use synthetic data and test email accounts. Do not put passwords, verification
  codes, session cookies, JWTs, Clerk secret keys, or full HAR files in tickets,
  screenshots, logs, or Git.
- Use a private/incognito browser profile with extensions disabled. Close it when
  testing is complete.
- Record the deployment commit, browser/version, base URL, Clerk instance, test
  time, tester, and pass/fail result for every case. Redact all authentication
  material from evidence.
- Treat unexpected access, data exposure, or a still-valid session after logout
  or revocation as a release-blocking security defect. Stop testing if the test
  deployment is accidentally connected to production data.

## Prerequisites

### People and access

- A tester who can use browser developer tools and inspect the staging deployment.
- A Clerk administrator who can inspect sessions, revoke a session, and confirm
  the configured authentication and session policies.
- Access to deployment logs is useful, but logs must not expose credentials,
  verification codes, session tokens, or personal data.

### Test identities

Prepare two verified Clerk accounts in the same test Clerk instance:

| Identity | Purpose | Required setup |
| --- | --- | --- |
| **Owner A** | Authorized positive control | Its Clerk user ID exactly matches `KINESIS_OWNER_CLERK_USER_ID`. |
| **User B** | Authenticated but unauthorized negative control | Its Clerk user ID differs from `KINESIS_OWNER_CLERK_USER_ID`. It must have no production access. |

Use a unique, recognizable synthetic record owned by Owner A (for example,
`AUTH-E2E-<date>`). Its presence lets the tester detect protected content in the
back/forward cache without using sensitive data.

### Deployment configuration

Before testing, confirm and record the effective values/settings without copying
secret values into the test report:

1. The deployment uses the intended Clerk **test/development** publishable and
   secret key pair and a dedicated non-production database.
2. `KINESIS_OWNER_CLERK_USER_ID` is set to Owner A's exact Clerk user ID, with no
   surrounding quotes or whitespace. Restart/redeploy after changing it.
3. The Clerk instance requires email verification and uses the intended password,
   device-trust, session-lifetime, and multi-session policies documented in
   `docs/security/clerk-configuration.md`.
4. The staging origin and redirect URLs are allowlisted in Clerk. The base URL is
   HTTPS for cookie-attribute tests; localhost is insufficient for validating a
   production `Secure` cookie posture.
5. Public registration is disabled or otherwise restricted according to the
   single-owner deployment policy. User B should be created administratively if
   public sign-up is disabled.

Define these local shell variables for the optional HTTP checks (they contain no
credentials):

```bash
export BASE_URL="https://staging.example.invalid"
export PROTECTED_PATH="/settings"
export PROTECTED_API="/api/settings/export"
```

Confirm `${BASE_URL}` has no trailing slash. Run `curl` without `-L` so redirects
can be inspected rather than followed.

### Browser preparation

1. Open a new private/incognito window and DevTools.
2. In **Network**, enable *Preserve log* and disable cache while DevTools is open.
3. In **Application/Storage**, confirm there are no existing cookies or site data
   for the application and Clerk domains.
4. Open a second private window only where a case explicitly requires it. Do not
   mix Owner A and User B in one browser profile.

## Test cases

Execute the cases in order unless a case says it is independent. Restore the
baseline (no active session) between cases.

### AUTH-M01 — Anonymous page and API access fail closed

**Preconditions:** No browser session exists. `${BASE_URL}` is available.

**Steps:**

1. Enter `${BASE_URL}/settings` directly in the address bar.
2. Confirm the browser is sent to the Kinesis `/sign-in` route. Inspect the
   redirect chain in Network.
3. Enter another protected deep link such as `${BASE_URL}/goals`.
4. In a terminal, run:

   ```bash
   curl -sS -D - -o /dev/null "${BASE_URL}${PROTECTED_PATH}"
   curl -sS -D - -o /dev/null "${BASE_URL}${PROTECTED_API}"
   ```

**Expected results:**

- Protected pages redirect to a same-site `/sign-in` URL and never render Kinesis
  data, even briefly.
- The protected API returns `401 Unauthorized`; it does not redirect to an HTML
  login page and returns no export content.
- Redirect parameters, if Clerk adds any, do not point to an untrusted origin and
  contain no token or sensitive data.
- No authenticated session cookie is created merely by visiting a protected URL.

### AUTH-M02 — Invalid login does not create or reuse a session

**Preconditions:** Signed out in a clean private window. A deliberately incorrect
password is available; do not record it.

**Steps:**

1. Visit `${BASE_URL}/sign-in` and submit Owner A's email with an incorrect
   password.
2. Inspect the Network response and browser storage.
3. Refresh the page, then request `${BASE_URL}/settings` directly.
4. Repeat a small number of times sufficient to observe the configured Clerk
   anti-abuse response. Do not conduct a denial-of-service or broad password-
   guessing exercise.

**Expected results:**

- The UI gives a generic failure that does not reveal whether an account is the
  configured Kinesis owner.
- No usable Kinesis session is established, no protected content is returned,
  and the direct protected request still redirects to sign-in.
- Responses and URLs contain no password or verification code.
- Clerk's configured rate-limit/bot/lockout control activates as documented, or
  the lack of that control is recorded as a security configuration finding.

### AUTH-M03 — Owner login establishes only a protected session

**Preconditions:** Owner A is signed out. The test device can complete any required
device verification.

**Steps:**

1. Navigate first to `${BASE_URL}/settings`, allow the redirect to `/sign-in`, and
   sign in as Owner A.
2. Complete email/device verification if challenged.
3. Confirm the browser reaches a protected Kinesis page and can see only Owner A's
   synthetic record.
4. Inspect the complete redirect chain, final URL, page source/Network responses,
   console, and application storage.
5. Open `${BASE_URL}${PROTECTED_API}` in the same authenticated browser and verify
   it returns an Owner A export. Delete the downloaded synthetic export after the
   check.

**Expected results:**

- Authentication completes over HTTPS and returns only to the expected Kinesis
  origin/path; no external or protocol-relative redirect occurs.
- No password, verification code, Clerk secret, or session token appears in URLs,
  rendered HTML, console output, or ordinary application logs.
- Session cookies use Clerk's intended prefixes/attributes. On the HTTPS staging
  origin they are `Secure`; authentication cookies are not readable through
  `document.cookie` when they are intended to be `HttpOnly`; and `SameSite`,
  `Path`, `Domain`, and expiry scope are no broader than Clerk's documented
  configuration requires. Record actual cookie names because Clerk may change
  them; do not copy their values.
- Only Owner A's data is rendered/exported, and the export response uses
  `Cache-Control: no-store`.

### AUTH-M04 — Authenticated non-owner is denied server-side

**Preconditions:** A separate clean private profile is signed out. User B exists
in the test Clerk instance.

**Steps:**

1. Sign in at `${BASE_URL}/sign-in` as User B.
2. Request `${BASE_URL}/`, `${BASE_URL}/settings`, and the protected API directly.
3. Inspect status codes and response bodies in Network. Search responses only for
   the synthetic Owner A marker; do not save complete bodies.
4. Confirm in the database/admin view that User B did not claim, rotate, or create
   the local Kinesis owner and that Owner A's binding is unchanged.

**Expected results:**

- Clerk may authenticate User B, but Kinesis returns `403 Forbidden` for every
  protected page and API request.
- No protected layout, Owner A identifier, synthetic marker, export content,
  stack trace, or owner configuration value is disclosed.
- User B is not provisioned as the Kinesis owner and cannot alter Owner A's data.
- Repeating the request or signing out/in does not convert the denial into access.

### AUTH-M05 — Missing owner configuration fails closed

**Preconditions:** An isolated staging deployment or temporary preview can safely
have `KINESIS_OWNER_CLERK_USER_ID` removed. Owner A can authenticate with Clerk.

**Steps:**

1. Remove `KINESIS_OWNER_CLERK_USER_ID` from that deployment and redeploy/restart
   every instance. Do not set it to an empty quoted string.
2. Sign in as Owner A and request a protected page and protected API.
3. Record their status codes and inspect responses for data or secret leakage.
4. Restore the variable to Owner A's ID and redeploy before continuing.

**Expected results:**

- Both protected requests return `503`; neither returns Kinesis data or provisions
  a local owner.
- The message indicates a server configuration problem without exposing any Clerk
  user ID, key, token, database detail, or stack trace.
- Restoring the setting restores Owner A access without changing the local owner
  or losing data.

### AUTH-M06 — Logout invalidates access in every tab and browser history

**Preconditions:** Owner A is signed in. Two tabs show protected pages, including
one containing the synthetic marker. DevTools preserves the network log.

**Steps:**

1. In tab 1, open the avatar menu and use Clerk's **Sign out** action. Wait for it
   to finish; do not manually delete cookies.
2. In tab 1, enter `${BASE_URL}/settings` directly.
3. In tab 2, refresh the protected page, then navigate to another protected page.
4. Use Back and Forward in both tabs. Observe the screen before and after the
   browser's `pageshow`/network activity.
5. In DevTools, resend a previously successful **safe GET** request to
   `${PROTECTED_API}` after logout. Do not replay a mutation or destructive action.
6. Close and reopen the private window and request the protected deep link again.

**Expected results:**

- Logout completes without an open redirect and removes/invalidates the Kinesis
  authentication session.
- Every new protected page request redirects to `/sign-in`, and every protected
  API request returns `401` with no exported data.
- The other tab loses access on refresh/navigation. It cannot perform a successful
  authenticated request using the old session.
- Browser history does not reveal usable protected content after logout. A
  momentary browser back/forward-cache snapshot, if the browser displays one, is
  recorded as a finding; it must disappear before interaction and must never
  permit data access or actions.
- Closing/reopening the private window does not restore the logged-out session.

### AUTH-M07 — Server-side revocation and expiry reject an open browser

**Preconditions:** Owner A is signed in on the test browser. A Clerk administrator
can identify that test session without sharing its token.

**Steps:**

1. From the Clerk dashboard, revoke Owner A's current test session.
2. In the still-open browser, refresh a protected page and request the protected
   API.
3. Attempt navigation from one protected page to another.
4. Independently repeat the test with a short session lifetime in an isolated
   Clerk test instance: set the lifetime before login, sign in, wait past expiry,
   and repeat steps 2–3. Restore the normal policy afterward.

**Expected results:**

- Revoked and expired sessions cannot load a protected page or API response;
  pages require sign-in and APIs return `401` without data.
- A client-side screen left open does not make a subsequent server action or API
  call succeed.
- Reauthentication creates a new session; it does not make the revoked/expired
  session valid again.
- No raw token or account detail is disclosed in errors or logs.

### AUTH-M08 — Concurrent-window and session-boundary checks

**Preconditions:** Clerk multi-session handling is disabled as documented. Owner A
is signed in in private window 1; private window 2 starts clean.

**Steps:**

1. In window 2, sign in as Owner A and observe whether Clerk permits or challenges
   the second session according to the configured policy.
2. Sign out in window 2, then refresh and navigate in window 1.
3. If Clerk treats the windows as independent sessions, revoke window 1's session
   in Clerk and confirm window 2's already-logged-out state remains logged out.
4. Confirm neither window ever displays User B or another identity's data.

**Expected results:**

- Actual behavior matches the recorded Clerk multi-session policy; any deviation
  is a configuration failure.
- Signing out or revoking a session never causes identity confusion, owner
  reassignment, or access under a different Clerk identity.
- A session that should be invalid cannot make a successful protected request.

### AUTH-M09 — Login and logout destinations resist open redirects

**Preconditions:** No active session. Use only harmless, tester-controlled example
destinations; do not send credentials to a third party.

**Steps:**

1. Request `/sign-in` with likely return/destination parameters set to an absolute
   external URL, a protocol-relative URL, and an encoded external URL. Examples:
   `?redirect_url=https%3A%2F%2Fexample.invalid` and
   `?redirect_url=%2F%2Fexample.invalid`.
2. Complete login as Owner A for each variant, one at a time.
3. Repeat using any return parameter actually emitted by the anonymous redirect
   flow, if it differs from `redirect_url`.
4. Invoke normal sign-out and inspect its redirect destination. Do not manually
   construct or submit a logout request to a third-party origin.

**Expected results:**

- Login and logout remain on the allowlisted Kinesis/Clerk origins and safe local
  paths. Untrusted absolute, protocol-relative, double-encoded, or malformed
  destinations are rejected or replaced with a safe default.
- No session token, ticket, password, or verification code is sent to
  `example.invalid` or placed in the URL.

## Completion and evidence checklist

The run is complete only when:

- AUTH-M01 through AUTH-M09 have a recorded pass/fail/not-run result and any
  not-run case has an owner and reason.
- Browser/version, deployment commit, base URL, Clerk environment, session policy,
  and redacted status/redirect evidence are attached to the test record.
- Owner A access has been restored, User B remains unauthorized, temporary session
  policy changes have been reverted, and all test sessions have been revoked.
- Downloaded exports, HAR files, screenshots containing personal data, and local
  test secrets have been securely deleted.
- Any failure that exposed data or accepted an invalid session is release-blocking;
  lower-severity configuration discrepancies are tracked with an owner and due
  date before release approval.

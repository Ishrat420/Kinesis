# Manual Authentication Lifecycle Security Test Plan

## Purpose and scope

This plan covers the browser-to-Clerk login and logout lifecycle that the Vitest
suites cannot exercise. It verifies authentication, invitation-only access, the
boundary between accounts, session invalidation, browser history/cache
behaviour, and server-side protection of pages and APIs.

*Revised for v1.5.0 (ADR-014).* One deployment now hosts many people, each with
their own private account. Two controls decide access:

- **Clerk's Restricted sign-up mode** decides who can sign in at all: accounts
  exist only by invitation.
- **Kinesis** lets any signed-in Clerk user into their **own** account, and
  never into anyone else's. A new identity always gets a new, empty account.

`KINESIS_OWNER_CLERK_USER_ID` now only marks the admin who may invite. The
old "non-owner gets 403" and "missing owner setting gives 503" behaviours are
gone; AUTH-M04 and AUTH-M05 test what replaced them. Results recorded before
v1.5.0 are kept under each case for history, labelled as such.

Run the complete plan before an authentication, Clerk, proxy, cookie, domain, or
session-policy change is released. Run the production-domain checks against a
production-like staging deployment; do **not** use real production user data.

## Security rules for execution

- Use a dedicated Clerk test/development instance, staging deployment, and test
  database. Never change the production admin ID merely to run this plan.
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

Prepare these in the same test Clerk instance:

| Identity | Purpose | Required setup |
| --- | --- | --- |
| **Admin A** | Positive control; the person who invites | Its Clerk user ID exactly matches `KINESIS_OWNER_CLERK_USER_ID`. |
| **Invited User B** | A second, legitimately invited person | Invited by email from the Clerk dashboard (AUTH-M11), invitation accepted. |
| **Uninvited C** | Someone who was never invited | A test email address that has **never** been invited and isn't a user in the Clerk instance. Use a Google account too, if Google SSO is enabled. |

Use a unique, recognizable synthetic record in each account: `AUTH-A-<date>` in
Admin A's and `AUTH-B-<date>` in User B's. Their presence or absence is how
the tester detects data crossing between accounts, or protected content in the
back/forward cache, without using sensitive data.

### Deployment configuration

Before testing, confirm and record the effective values/settings without copying
secret values into the test report:

1. The deployment uses the intended Clerk **test/development** publishable and
   secret key pair and a dedicated non-production database.
2. `KINESIS_OWNER_CLERK_USER_ID` is set to Admin A's exact Clerk user ID, with no
   surrounding quotes or whitespace. Restart/redeploy after changing it.
3. **Restricted sign-up mode is on** for the Clerk instance (Configure →
   Restrictions → Sign-up mode: Restricted). This is now the control that keeps
   uninvited people out; record its state in the test report.
4. **The instance's user list has been reviewed.** Every Clerk user already in
   the instance can sign in and get an account (see AUTH-M12). Record how many
   users it holds and that each is expected.
5. The Clerk instance requires email verification and uses the intended password,
   device-trust, session-lifetime, and multi-session policies documented in
   `docs/security/clerk-configuration.md`.
6. The staging origin and redirect URLs are allowlisted in Clerk. The base URL is
   HTTPS for cookie-attribute tests; localhost is insufficient for validating a
   production `Secure` cookie posture.

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
   mix Admin A, User B and Uninvited C in one browser profile, except in
   AUTH-M14, which tests exactly that on purpose.

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


Results:
[Date 29/08/26]: 
Case 1 -> 
Case 2 -> 

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

1. Visit `${BASE_URL}/sign-in` and submit Admin A's email with an incorrect
   password.
2. Inspect the Network response and browser storage.
3. Refresh the page, then request `${BASE_URL}/settings` directly.
4. Repeat a small number of times sufficient to observe the configured Clerk
   anti-abuse response. Do not conduct a denial-of-service or broad password-
   guessing exercise.

**Expected results:**

- The UI gives a generic failure that does not reveal whether an account exists,
  is the admin, or has a Kinesis account.
- No usable Kinesis session is established, no protected content is returned,
  and the direct protected request still redirects to sign-in.
- Responses and URLs contain no password or verification code.
- Clerk's configured rate-limit/bot/lockout control activates as documented, or
  the lack of that control is recorded as a security configuration finding.


Results:
[Date 09/09/26] -> Password input does not show up, instead an code is sent to email


### AUTH-M03 — Admin login establishes only a protected session

**Preconditions:** Admin A is signed out. The test device can complete any required
device verification.

**Steps:**

1. Navigate first to `${BASE_URL}/settings`, allow the redirect to `/sign-in`, and
   sign in as Admin A.
2. Complete email/device verification if challenged.
3. Confirm the browser reaches a protected Kinesis page and can see only Admin A's
   synthetic record.
4. Inspect the complete redirect chain, final URL, page source/Network responses,
   console, and application storage.
5. Open `${BASE_URL}${PROTECTED_API}` in the same authenticated browser and verify
   it returns an Admin A export. Delete the downloaded synthetic export after the
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
- Only Admin A's data is rendered/exported, and the export response uses
  `Cache-Control: no-store`.

Results:
[Date 09/09/26] -> Expected 


### AUTH-M04 — A second signed-in person reaches only their own account

**Preconditions:** A separate clean private profile is signed out. Invited User B
has accepted their invitation (AUTH-M11). Admin A's account holds `AUTH-A-<date>`.

**Steps:**

1. Sign in at `${BASE_URL}/sign-in` as User B.
2. On first sign-in, confirm User B lands in an **empty** Kinesis: no
   `AUTH-A-<date>`, no documents, goals or other records of Admin A's.
3. Create `AUTH-B-<date>` in User B's account.
4. Search (⌘K) for `AUTH-A`, and open the calendar, notifications bell and
   dashboard. Confirm nothing of Admin A's appears anywhere.
5. As Admin A, in a different profile, copy the URL of one of Admin A's records
   (for example `/documents/<id>`). Open that exact URL as User B.
6. Request `${BASE_URL}${PROTECTED_API}` as User B; open the downloaded export
   and check it contains only `AUTH-B-<date>`, then delete it.
7. Confirm in the database/admin view that User B has their own `User` row (a
   new `id`, `clerkUserId` = B), and that Admin A's row and data are unchanged.

**Expected results:**

- User B gets in, to a new, empty account of their own. They are never given
  Admin A's account or data.
- Admin A's record URL opened by User B shows Kinesis's "not found" page, the
  same as for an id that doesn't exist. It never shows Admin A's record, a
  stack trace or any other account's id.
- Search, calendar, notifications, dashboard and export contain only User B's
  data.
- Signing out and in again returns User B to the same account, not a new one.

Results (single-owner version, before v1.5.0, when User B was expected to get 403):
[Date 29/08/26]: 
Case 1 -> User B tries to sign-in by putting a random password, and it says password it incorrect. 
Case 2 -> User B tries to sign-in by putting User A's password, then a sign in code is sent to User A's email, if User B puts an incorrect code then User B gets invalid code message. However, if the correct code is entered then it also gets an 403 Forbidden anyway. Confirmed that in the database/admin view that User B did not claim, rotate, or create the local Kinesis owner and that Owner A's binding is unchanged.
[Date 09/09/26] -> Password input does not show up, instead an code is sent to email

### AUTH-M05 — The admin setting doesn't control access

**Preconditions:** An isolated staging deployment or temporary preview can safely
have `KINESIS_OWNER_CLERK_USER_ID` changed. Admin A and User B can sign in.

**Steps:**

1. Remove `KINESIS_OWNER_CLERK_USER_ID` from that deployment and redeploy/restart
   every instance. Do not set it to an empty quoted string.
2. Sign in as Admin A, then (separately) as User B. Load a protected page and the
   protected API as each.
3. Set the variable to User B's Clerk user ID and redeploy. Repeat step 2.
4. Restore the variable to Admin A's ID and redeploy before continuing.

**Expected results:**

- With the setting missing, both people still sign in to their own accounts and
  see their own data. Nobody is admin; the app works normally.
- Pointing the setting at User B makes User B the admin. It gives User B **no**
  access to Admin A's data, and Admin A still reaches their own account.
- No response exposes a Clerk user ID, key, token, database detail or stack
  trace at any point.

Results (single-owner version, before v1.5.0, when a missing setting was expected to give 503):
[Date 09/09/26] -> The login/Sign in does not work at all, and requesting a protected page does not work
e.g. https://URL/settings , returns to log-in page 


### AUTH-M06 — Logout invalidates access in every tab and browser history

**Preconditions:** Admin A is signed in. Two tabs show protected pages, including
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

Results:
[Date 09/09/26] -> Sign out, just signs out of all tabs, get request does not work, the back button does not take to old page etc. 


### AUTH-M07 — Server-side revocation and expiry reject an open browser

**Preconditions:** Admin A is signed in on the test browser. A Clerk administrator
can identify that test session without sharing its token.

**Steps:**

1. From the Clerk dashboard, revoke Admin A's current test session.
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

Results:
[Date 29/08/26]: 
Case 1 -> 
Case 2 -> 


### AUTH-M08 — Concurrent-window and session-boundary checks

**Preconditions:** Clerk multi-session handling is disabled as documented. Admin A
is signed in in private window 1; private window 2 starts clean.

**Steps:**

1. In window 2, sign in as Admin A and observe whether Clerk permits or challenges
   the second session according to the configured policy.
2. Sign out in window 2, then refresh and navigate in window 1.
3. If Clerk treats the windows as independent sessions, revoke window 1's session
   in Clerk and confirm window 2's already-logged-out state remains logged out.
4. Confirm neither window ever displays User B or another identity's data.

**Expected results:**

- Actual behavior matches the recorded Clerk multi-session policy; any deviation
  is a configuration failure.
- Signing out or revoking a session never causes identity confusion, an account
  moving to another identity, or access under a different Clerk identity.
- A session that should be invalid cannot make a successful protected request.

Results:
[Date 29/08/26]: 
Case 1 -> 
Case 2 -> 


### AUTH-M09 — Login and logout destinations resist open redirects

**Preconditions:** No active session. Use only harmless, tester-controlled example
destinations; do not send credentials to a third party.

**Steps:**

1. Request `/sign-in` with likely return/destination parameters set to an absolute
   external URL, a protocol-relative URL, and an encoded external URL. Examples:
   `?redirect_url=https%3A%2F%2Fexample.invalid` and
   `?redirect_url=%2F%2Fexample.invalid`.
2. Complete login as Admin A for each variant, one at a time.
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


Results:
[Date 29/08/26]: 
Case 1 -> 
Case 2 -> 


### AUTH-M10 — Uninvited people can't sign up

This is the case that caught a real gap during v1.5.0 testing: with Restricted
sign-up mode off, an uninvited email signed up and got an account.

**Preconditions:** Restricted sign-up mode is on (Deployment configuration, item
3). Uninvited C has never been invited and isn't a user in the Clerk instance.
Clean private profile.

**Steps:**

1. At `${BASE_URL}/sign-in`, try to create an account / sign in with Uninvited
   C's email address.
2. Repeat with Uninvited C's Google account through Google SSO, if enabled.
3. Try the Clerk sign-up URL directly, if the instance exposes one.
4. In the database, check there is no `User` row with Uninvited C's email. In
   the Clerk dashboard, check no user was created for it.

**Expected results:**

- Clerk refuses every attempt with its "sign-ups are restricted" or
  invitation-required message. No verification code is accepted that would
  complete a sign-up.
- No Clerk user and no Kinesis account are created for Uninvited C.
- **If Uninvited C gets in at all, stop: Restricted mode is off or
  misconfigured. Treat it as release-blocking.** Then delete C's Clerk user and
  its Kinesis account (`DELETE FROM "User" WHERE "email" = '<C's email>';`).

Results:


### AUTH-M11 — Invitation lifecycle

**Preconditions:** Admin A can use the Clerk dashboard. A fresh test email that
has never been invited.

**Steps:**

1. In Clerk Dashboard → Users → Invitations, invite the fresh email.
2. Open the invitation email in a clean private profile, follow the link, and
   complete sign-up.
3. Confirm you land in Kinesis, in a new, empty account (as in AUTH-M04).
4. Invite a second fresh email, then **revoke** that invitation before it's
   used. Try its link.
5. Try reusing the first, already-accepted invitation link in a clean profile.

**Expected results:**

- An accepted invitation creates exactly one Clerk user and, on first visit,
  exactly one empty Kinesis account.
- A revoked invitation's link no longer lets anyone sign up.
- An already-used invitation link can't create a second account.
- The invitation email and link contain no session token or password.

Results:


### AUTH-M12 — Existing Clerk users without an invitation

Restricted mode only stops new sign-ups; it doesn't remove people already in
the Clerk instance. Kinesis currently has no check of its own for this
(an in-code invitation check has been proposed but not built), so this case
records the real behaviour.

**Preconditions:** A test user created directly in the Clerk dashboard (Users →
Create user), **not** through an invitation, with no Kinesis account yet.

**Steps:**

1. Sign in as that user.
2. Check whether they get into Kinesis, and whether a `User` row is created.

**Expected results (current, known limitation):**

- They **can** sign in and get a new, empty account of their own. They can't
  see anyone else's data.
- This is why Deployment configuration item 4 (reviewing the Clerk user list)
  is required. Record the result. If the in-code invitation check is built
  later, this case changes to "refused, no account created".
- Delete the test user and its Kinesis account afterwards.

Results:


### AUTH-M13 — Owner rotation with `owner:rebind`

**Preconditions:** Isolated staging deployment with its own database. Admin A's
account holds `AUTH-A-<date>`. A replacement Clerk user A2 exists (created by
invitation) and has **not** signed in yet.

**Steps:**

1. Against the staging database, run the dry run:
   `DATABASE_URL="..." npm run owner:rebind -- --from <A's user_...> --to <A2's user_...>`
   and confirm it prints the plan and "Dry run: nothing changed".
2. Run it again with `--yes`.
3. Set `KINESIS_OWNER_CLERK_USER_ID` to A2's ID and redeploy.
4. Sign in as A2. Confirm `AUTH-A-<date>` and the rest of A's data are there,
   and A2 is now the admin.
5. Sign in as the old identity A, if it still exists in Clerk.
6. Repeat steps 1–2 for a target identity that has already signed in and
   created a record of its own.

**Expected results:**

- The dry run changes nothing. The real run moves the account, with all its
  data, to A2, and records an `OWNER_REBOUND` security event on it.
- The old identity A, if it signs in, gets a **new, empty** account; it never
  sees the moved data. Delete A's Clerk user once A2 is verified.
- Step 6 is refused with "already has an account with data", changing nothing.

Results:


### AUTH-M14 — A shared device stops getting the previous person's push notifications

**Preconditions:** A test phone or browser with Kinesis installed and push
supported (see `tests/manual/kd053-push-walkthrough.md`). Admin A and User B
both have records that will raise notifications.

**Steps:**

1. Sign in as Admin A on the device and turn on push in Settings.
2. Sign out from the avatar menu.
3. Sign in as User B on the same device. Check Settings → Push notifications.
4. Trigger the daily push run (or wait for it), with something new on Admin A's
   bell.
5. Repeat steps 1–4, but this time close the app while signed in as Admin A and
   let the session end (revoke it in the Clerk dashboard) before User B signs in.

**Expected results:**

- After Admin A signs out, the device is unsubscribed from push. User B's
  Settings shows push as off for this device.
- The device never receives Admin A's notifications after User B signs in, in
  either variant. In step 5, the subscription is dropped as soon as User B
  opens the app.
- User B can turn push on for themselves, and then receives only User B's
  notifications.

Results:


## Completion and evidence checklist

The run is complete only when:

- AUTH-M01 through AUTH-M14 have a recorded pass/fail/not-run result and any
  not-run case has an owner and reason.
- Browser/version, deployment commit, base URL, Clerk environment, session policy,
  and redacted status/redirect evidence are attached to the test record.
- Admin A's access and `KINESIS_OWNER_CLERK_USER_ID` have been restored,
  Restricted sign-up mode is still on, temporary session policy changes have
  been reverted, and all test sessions have been revoked.
- Test-only Clerk users (Uninvited C if it was created, the AUTH-M12 user, old
  identities from AUTH-M13) and their Kinesis accounts have been deleted.
- Downloaded exports, HAR files, screenshots containing personal data, and local
  test secrets have been securely deleted.
- Any failure that exposed data or accepted an invalid session is release-blocking;
  lower-severity configuration discrepancies are tracked with an owner and due
  date before release approval.

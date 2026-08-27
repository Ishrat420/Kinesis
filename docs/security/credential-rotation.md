# Kinesis Credential & Identity Rotation

## Owner Identity Rotation

Use this procedure when the Clerk account authorized to own the
Kinesis instance needs to be replaced.

1. Create the replacement Clerk user.
2. Verify the replacement user's email/account.
3. Copy the replacement Clerk User ID.
4. Update `KINESIS_OWNER_CLERK_USER_ID` in the affected Vercel environment.
5. Redeploy the affected environment.
6. Sign in as the replacement owner and verify Kinesis access.
7. Verify the previous owner can no longer access Kinesis.
8. Delete/revoke the previous Clerk user only after successful verification.

> Changing the configured owner must not delete or transfer Kinesis
> application data. Ownership behaviour should be verified before
> removing the previous Clerk identity.


## Clerk Secret Key Rotation

The Clerk Secret Key (`CLERK_SECRET_KEY`) is a server-side credential and
must never be committed to source control.

Clerk now supports multiple active Secret Keys, specifically so you can rotate them without downtime.

To rotate it:

1. Select the appropriate Kinesis environment in Clerk dashboard 
2. Navigate to Configure > API Keys.
3. Create a new Secret Key with a descriptive name.
4. Keep the existing Secret Key active during the transition.
5. Update `CLERK_SECRET_KEY` in the corresponding Vercel environment.
6. Update local development configuration if applicable. (If your local .env.local also uses that same Clerk instance/key)
7. Redeploy all affected deployments.
8. Verify authentication and protected server operations.
9. Confirm the new Secret Key shows recent usage in Clerk.
10. Confirm the old Secret Key is no longer being used.
11. Delete the old Secret Key from Clerk after the replacement has been deployed and verified. 


## Publishable Key Rotation

If the Clerk publishable key must be replaced:

1. Update `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`.
2. Redeploy the affected environment.
3. Verify sign-in, sign-out and session handling.
4. Retire the previous configuration where applicable.
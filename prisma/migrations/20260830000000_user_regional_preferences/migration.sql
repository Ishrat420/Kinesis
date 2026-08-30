-- Regional formatting preferences. The defaults reproduce the values that were
-- previously hardcoded throughout the application, so existing deployments see
-- no change until the owner picks something else.
ALTER TABLE "UserSettings" ADD COLUMN "locale" TEXT NOT NULL DEFAULT 'en-AU';
ALTER TABLE "UserSettings" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'AUD';

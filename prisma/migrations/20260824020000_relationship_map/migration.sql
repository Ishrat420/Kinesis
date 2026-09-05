-- The relationship map was only ever created by `prisma db push`, so no migration
-- described it. `prisma migrate deploy` could not build the database from empty
-- (20260825090000_clerk_user_ownership alters a "Person" table nothing creates)
-- and `prisma migrate dev` had no usable shadow database, which is why the deploy
-- pipeline had to fall back to `db push`.
--
-- This restores the missing history at the point it belongs, in the shape it had
-- then: userId arrives in 20260825090000, selfNotes in 20260831000000 and
-- objectId in 20260901000100_universal_object_identity. Every statement is
-- guarded so databases that already carry these tables see a no-op.

CREATE TABLE IF NOT EXISTS "Person" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "icon" TEXT NOT NULL DEFAULT 'user',
    "color" TEXT NOT NULL DEFAULT '#292524',
    "bubbleSize" INTEGER NOT NULL DEFAULT 84,
    "positionX" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "positionY" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isSelf" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Relationship" (
    "id" TEXT NOT NULL,
    "firstPersonId" TEXT NOT NULL,
    "secondPersonId" TEXT NOT NULL,
    "type" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Relationship_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ConnectionPractice" (
    "id" TEXT NOT NULL,
    "relationshipId" TEXT,
    "selfPersonId" TEXT,
    "title" TEXT NOT NULL,
    "cadence" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConnectionPractice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "RelationshipReflection" (
    "id" TEXT NOT NULL,
    "relationshipId" TEXT,
    "selfPersonId" TEXT,
    "text" TEXT NOT NULL,
    "reflectedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RelationshipReflection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "RelationshipImportantDate" (
    "id" TEXT NOT NULL,
    "relationshipId" TEXT,
    "selfPersonId" TEXT,
    "label" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "repeatsYearly" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "RelationshipImportantDate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "RelationshipGoal" (
    "relationshipId" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,

    CONSTRAINT "RelationshipGoal_pkey" PRIMARY KEY ("relationshipId","goalId")
);

CREATE INDEX IF NOT EXISTS "Relationship_firstPersonId_idx" ON "Relationship"("firstPersonId");
CREATE INDEX IF NOT EXISTS "Relationship_secondPersonId_idx" ON "Relationship"("secondPersonId");
CREATE INDEX IF NOT EXISTS "ConnectionPractice_relationshipId_position_idx" ON "ConnectionPractice"("relationshipId", "position");
CREATE INDEX IF NOT EXISTS "ConnectionPractice_selfPersonId_position_idx" ON "ConnectionPractice"("selfPersonId", "position");
CREATE INDEX IF NOT EXISTS "RelationshipReflection_relationshipId_reflectedAt_idx" ON "RelationshipReflection"("relationshipId", "reflectedAt");
CREATE INDEX IF NOT EXISTS "RelationshipReflection_selfPersonId_reflectedAt_idx" ON "RelationshipReflection"("selfPersonId", "reflectedAt");
CREATE INDEX IF NOT EXISTS "RelationshipImportantDate_relationshipId_date_idx" ON "RelationshipImportantDate"("relationshipId", "date");
CREATE INDEX IF NOT EXISTS "RelationshipImportantDate_selfPersonId_date_idx" ON "RelationshipImportantDate"("selfPersonId", "date");
CREATE INDEX IF NOT EXISTS "RelationshipGoal_goalId_idx" ON "RelationshipGoal"("goalId");

-- PostgreSQL has no ADD CONSTRAINT IF NOT EXISTS.
DO $$
DECLARE
    statement TEXT;
BEGIN
    FOREACH statement IN ARRAY ARRAY[
        'ALTER TABLE "Relationship" ADD CONSTRAINT "Relationship_firstPersonId_fkey" FOREIGN KEY ("firstPersonId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE',
        'ALTER TABLE "Relationship" ADD CONSTRAINT "Relationship_secondPersonId_fkey" FOREIGN KEY ("secondPersonId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE',
        'ALTER TABLE "ConnectionPractice" ADD CONSTRAINT "ConnectionPractice_relationshipId_fkey" FOREIGN KEY ("relationshipId") REFERENCES "Relationship"("id") ON DELETE CASCADE ON UPDATE CASCADE',
        'ALTER TABLE "ConnectionPractice" ADD CONSTRAINT "ConnectionPractice_selfPersonId_fkey" FOREIGN KEY ("selfPersonId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE',
        'ALTER TABLE "RelationshipReflection" ADD CONSTRAINT "RelationshipReflection_relationshipId_fkey" FOREIGN KEY ("relationshipId") REFERENCES "Relationship"("id") ON DELETE CASCADE ON UPDATE CASCADE',
        'ALTER TABLE "RelationshipReflection" ADD CONSTRAINT "RelationshipReflection_selfPersonId_fkey" FOREIGN KEY ("selfPersonId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE',
        'ALTER TABLE "RelationshipImportantDate" ADD CONSTRAINT "RelationshipImportantDate_relationshipId_fkey" FOREIGN KEY ("relationshipId") REFERENCES "Relationship"("id") ON DELETE CASCADE ON UPDATE CASCADE',
        'ALTER TABLE "RelationshipImportantDate" ADD CONSTRAINT "RelationshipImportantDate_selfPersonId_fkey" FOREIGN KEY ("selfPersonId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE',
        'ALTER TABLE "RelationshipGoal" ADD CONSTRAINT "RelationshipGoal_relationshipId_fkey" FOREIGN KEY ("relationshipId") REFERENCES "Relationship"("id") ON DELETE CASCADE ON UPDATE CASCADE',
        'ALTER TABLE "RelationshipGoal" ADD CONSTRAINT "RelationshipGoal_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE'
    ] LOOP
        BEGIN
            EXECUTE statement;
        EXCEPTION WHEN duplicate_object THEN NULL;
        END;
    END LOOP;
END $$;

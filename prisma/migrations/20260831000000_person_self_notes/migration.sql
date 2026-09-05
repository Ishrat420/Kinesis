-- Notes for the relationship a person has with themselves (KD-021). Practices,
-- reflections and important dates already hang off Person via selfPersonId; notes
-- were the one element of the relationship inspector with nowhere to live.
ALTER TABLE "Person" ADD COLUMN "selfNotes" TEXT;

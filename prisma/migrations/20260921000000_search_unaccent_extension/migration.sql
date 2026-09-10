-- Global search (lib/search) used to read every linkable row on every page
-- load and rank in JavaScript, which is what made accent-insensitive matching
-- (`cafe` finding "Café") free: everything was already in memory. Moving the
-- match itself into SQL, so search only reads what the query could plausibly
-- match, needs the database to be able to do that same accent folding.
-- unaccent is a standard, low-risk contrib extension (supported on RDS,
-- Supabase, and Neon alike).
CREATE EXTENSION IF NOT EXISTS unaccent;

b26ccc8 Require a minimum query length before searching at all
e2016ee Stop matching documents on their owner field in search
90e8277 Stop prefetching every search result on every keystroke
14169bf Fix search dropping matches that live only in a subtitle
28a86f0 Add loading.tsx to every route missing one
2a8fc53 Move global search into the database, query-driven
88e48eb Cap getKinesisLinkOptions at a sanity bound
92bed5e Stop copy-pasting the client-state-from-props resync, twice over
f936cc4 File BUG-007: no optimistic concurrency on multi-row saves
04b9377 Standardize revalidatePath on one shell-revalidating helper
ba7f1af Make ownership explicit in saveRelationshipMap's child-table scope
90edbb4 Add an OPS ticket type for devops/infrastructure work, and OPS-001
f0a415b Add a SessionStart hook to provision Postgres for Claude Code on the web
f54b283 Make tsc --noEmit pass, and add a typecheck script
e764b33 Give finance, attention, kinesis-links, objects, and upcoming real-database test coverage
c2ed74b Give the template subsystem real-database test coverage
5d27d73 Data export: include FieldLink, Template, ActivityEvent, NotificationRead
7810855 Delete all data: actually delete templates
3a90c76 Drop CustomItem.notes and .link -- dead since KD-040
d6ffad4 Wire up Documents' search bar -- it never actually filtered anything
8c2bac6 Add a search bar to To-Dos, matching Documents' style
aa645ae Remove the constellation map's Reset button
e3ab173 Recolor Milestones violet, matching Goals; pill up the window link
7312853 Rename "Supporting information" to "Goal Details"
b042120 Drop the outer card around Linked Goals
4ff2a62 Drop the outer card around the measurable target section
2253c8e To-Do row: replace the status/edit/delete controls with a 3-dot menu
304eeee Replace the template list's long pill with icon + count pairs
263b37d Drop the colored icon background for custom modules in the sidebar
efeacfe Make the custom item detail page read-only with an Edit button
9ca85ba Fix template field types reverting to Text after saving
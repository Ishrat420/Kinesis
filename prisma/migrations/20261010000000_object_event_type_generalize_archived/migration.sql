-- DOCUMENT_ARCHIVED/DOCUMENT_RESTORED were never wired to any writer, so
-- this is a pure rename, not a data migration -- no ObjectEvent row can
-- exist with either old value yet.
ALTER TYPE "ObjectEventType" RENAME VALUE 'DOCUMENT_ARCHIVED' TO 'ITEM_ARCHIVED';
ALTER TYPE "ObjectEventType" RENAME VALUE 'DOCUMENT_RESTORED' TO 'ITEM_RESTORED';

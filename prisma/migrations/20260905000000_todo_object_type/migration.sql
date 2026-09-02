-- PostgreSQL enum values must be committed before later migrations can use them,
-- so 'TODO' is added on its own and 20260905000100_standalone_todos uses it.
ALTER TYPE "KinesisObjectType" ADD VALUE IF NOT EXISTS 'TODO';

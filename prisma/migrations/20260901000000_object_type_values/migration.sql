-- PostgreSQL enum values must be committed before later migrations can use them.
ALTER TYPE "KinesisObjectType" ADD VALUE IF NOT EXISTS 'FINANCE_ITEM';
ALTER TYPE "KinesisObjectType" ADD VALUE IF NOT EXISTS 'PERSON';

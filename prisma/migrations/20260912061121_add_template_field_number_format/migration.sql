-- CreateEnum
CREATE TYPE "NumberFieldFormat" AS ENUM ('CURRENCY', 'PERCENT');

-- AlterTable
ALTER TABLE "TemplateField" ADD COLUMN     "numberFormat" "NumberFieldFormat";

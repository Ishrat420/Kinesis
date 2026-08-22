CREATE TABLE "CustomModule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CustomModule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomItem" (
    "id" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "reminder" TIMESTAMP(3),
    "link" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CustomItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomItemField" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "CustomItemField_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CustomModule_normalizedName_key" ON "CustomModule"("normalizedName");
CREATE INDEX "CustomItem_moduleId_archived_createdAt_idx" ON "CustomItem"("moduleId", "archived", "createdAt");
CREATE INDEX "CustomItemField_itemId_position_idx" ON "CustomItemField"("itemId", "position");
ALTER TABLE "CustomItem" ADD CONSTRAINT "CustomItem_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "CustomModule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomItemField" ADD CONSTRAINT "CustomItemField_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "CustomItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "phone" TEXT NOT NULL,
    "name" TEXT,
    "archivedAt" TIMESTAMP(3),
    "lastMessageAt" TIMESTAMP(3),
    "lastReadAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "currentLeadId" TEXT
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contactId" TEXT NOT NULL,
    "leadId" TEXT,
    "content" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "senderId" TEXT,
    "whatsappMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- AlterTable: add contactId nullable first, backfill below, then tighten
ALTER TABLE "Lead" ADD COLUMN "contactId" TEXT;

-- Backfill: one Contact per distinct existing Lead phone (Fase 1 stored
-- phone loose on Lead; Fase 2 moves it to Contact so a phone number can be
-- shared by leads created at different times). Contact.name seeds from the
-- most recently updated lead sharing that phone.
INSERT INTO "Contact" (id, phone, name, "createdAt", "updatedAt")
SELECT DISTINCT ON ("phone")
  substr(md5(random()::text || clock_timestamp()::text || "phone"), 1, 25),
  "phone",
  "contactName",
  now(),
  now()
FROM "Lead"
ORDER BY "phone", "updatedAt" DESC;

UPDATE "Lead" l
SET "contactId" = c.id
FROM "Contact" c
WHERE c."phone" = l."phone";

ALTER TABLE "Lead" ALTER COLUMN "contactId" SET NOT NULL;
ALTER TABLE "Lead" DROP COLUMN "phone";

-- Backfill: point each Contact at its most recently updated Lead as the
-- "current" one that new incoming messages should attach to.
UPDATE "Contact" c
SET "currentLeadId" = sub.id
FROM (
  SELECT DISTINCT ON ("contactId") id, "contactId"
  FROM "Lead"
  ORDER BY "contactId", "updatedAt" DESC
) sub
WHERE sub."contactId" = c.id;

-- CreateIndex
CREATE UNIQUE INDEX "Contact_phone_key" ON "Contact"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_currentLeadId_key" ON "Contact"("currentLeadId");

-- CreateIndex
CREATE UNIQUE INDEX "Message_whatsappMessageId_key" ON "Message"("whatsappMessageId");

-- CreateIndex
CREATE INDEX "Message_contactId_idx" ON "Message"("contactId");

-- CreateIndex
CREATE INDEX "Message_leadId_idx" ON "Message"("leadId");

-- CreateIndex
CREATE INDEX "Lead_contactId_idx" ON "Lead"("contactId");

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_currentLeadId_fkey" FOREIGN KEY ("currentLeadId") REFERENCES "Lead" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

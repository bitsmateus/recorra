-- AlterTable
ALTER TABLE "message_dispatches" ADD COLUMN     "campaignId" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "resetToken" TEXT,
ADD COLUMN     "resetTokenExp" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "message_dispatches_tenantId_campaignId_idx" ON "message_dispatches"("tenantId", "campaignId");

-- AlterTable
ALTER TABLE "carteiras" ADD COLUMN     "nxQueueId" INTEGER;

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "channelAccountId" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "nxQueueId" INTEGER,
ADD COLUMN     "nxUserId" INTEGER;

-- CreateTable
CREATE TABLE "nx_ticket_routes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "channelAccountId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "queueId" INTEGER NOT NULL,
    "customerId" TEXT,
    "responsavelId" TEXT,
    "motivo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nx_ticket_routes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "nx_ticket_routes_tenantId_createdAt_idx" ON "nx_ticket_routes"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "nx_ticket_routes_channelAccountId_ticketId_key" ON "nx_ticket_routes"("channelAccountId", "ticketId");

-- AddForeignKey
ALTER TABLE "nx_ticket_routes" ADD CONSTRAINT "nx_ticket_routes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

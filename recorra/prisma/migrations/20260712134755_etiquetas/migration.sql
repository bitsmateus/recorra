-- CreateEnum
CREATE TYPE "TutorialTipo" AS ENUM ('VIDEO', 'TEXTO');

-- CreateTable
CREATE TABLE "tutoriais" (
    "id" TEXT NOT NULL,
    "secao" TEXT NOT NULL DEFAULT 'geral',
    "titulo" TEXT NOT NULL,
    "tipo" "TutorialTipo" NOT NULL DEFAULT 'TEXTO',
    "videoUrl" TEXT,
    "conteudo" TEXT,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tutoriais_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tutoriais_secao_ordem_idx" ON "tutoriais"("secao", "ordem");

-- CreateIndex
CREATE INDEX "tags_tenantId_idx" ON "tags"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "tags_tenantId_nome_key" ON "tags"("tenantId", "nome");

-- AddForeignKey
ALTER TABLE "tags" ADD CONSTRAINT "tags_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

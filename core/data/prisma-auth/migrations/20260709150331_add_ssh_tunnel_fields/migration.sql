-- AlterTable
ALTER TABLE "DatabaseConnection" ADD COLUMN "sshEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "DatabaseConnection" ADD COLUMN "sshHost" TEXT;
ALTER TABLE "DatabaseConnection" ADD COLUMN "sshPort" INTEGER DEFAULT 22;
ALTER TABLE "DatabaseConnection" ADD COLUMN "sshUsername" TEXT;
ALTER TABLE "DatabaseConnection" ADD COLUMN "sshAuthMethod" TEXT;
ALTER TABLE "DatabaseConnection" ADD COLUMN "sshPassword" TEXT;
ALTER TABLE "DatabaseConnection" ADD COLUMN "sshPrivateKey" TEXT;

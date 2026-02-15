-- AlterTable
ALTER TABLE "sessions"
ADD COLUMN "category" TEXT NOT NULL DEFAULT 'etc',
ADD COLUMN "level" TEXT NOT NULL DEFAULT 'spicy';

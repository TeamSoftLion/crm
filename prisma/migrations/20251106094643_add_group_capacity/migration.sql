/*
  Warnings:

  - Added the required column `capacity` to the `Group` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Group" ADD COLUMN     "capacity" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "Room" ALTER COLUMN "capacity" SET DEFAULT 10;

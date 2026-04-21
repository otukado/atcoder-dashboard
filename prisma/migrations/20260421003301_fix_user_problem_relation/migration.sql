/*
  Warnings:

  - The primary key for the `Problem` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - A unique constraint covering the columns `[userId,id]` on the table `Problem` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `userId` to the `Problem` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Submission" DROP CONSTRAINT "Submission_problemId_fkey";

-- AlterTable
ALTER TABLE "Problem" DROP CONSTRAINT "Problem_pkey",
ADD COLUMN     "userId" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Problem_userId_id_key" ON "Problem"("userId", "id");

-- AddForeignKey
ALTER TABLE "Problem" ADD CONSTRAINT "Problem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_userId_problemId_fkey" FOREIGN KEY ("userId", "problemId") REFERENCES "Problem"("userId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

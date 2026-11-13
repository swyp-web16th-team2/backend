-- CreateTable
CREATE TABLE "ping" (
    "id" SERIAL NOT NULL,
    "message" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ping_pkey" PRIMARY KEY ("id")
);

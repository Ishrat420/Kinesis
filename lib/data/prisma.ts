import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    // Query logging emits the statement's parameters alongside it, so in
    // production it writes the owner's document names, notes and amounts
    // straight into the platform's logs. Faults still surface.
    log: process.env.NODE_ENV === "production" ? ["error", "warn"] : ["query", "error", "warn"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
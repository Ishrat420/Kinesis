import { prisma } from "./prisma";

export const CURRENT_USER_ID = "current";
export const defaultUser = { id: CURRENT_USER_ID, firstName: "Ishrat", lastName: "", preferredName: null as string | null, email: "" };

export function getUserDisplayName(user: { firstName: string; preferredName: string | null }) {
  return user.preferredName?.trim() || user.firstName.trim();
}

export async function getCurrentUser() {
  return (await prisma.user.findUnique({ where: { id: CURRENT_USER_ID } })) ?? defaultUser;
}

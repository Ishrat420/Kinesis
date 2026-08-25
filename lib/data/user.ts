import { requireKinesisUser } from "@/lib/auth";

export function getUserDisplayName(user: { firstName: string; preferredName: string | null }) {
  return user.preferredName?.trim() || user.firstName.trim();
}

export async function getCurrentUser() {
  return requireKinesisUser();
}

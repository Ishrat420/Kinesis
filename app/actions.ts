"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/data/prisma";
import { requireKinesisUser } from "@/lib/auth";

export async function dismissAttentionItem(itemKey: string) {
  if (!/^(document|milestone|custom):[^:]+$/.test(itemKey)) return;
  const user = await requireKinesisUser();
  await prisma.attentionDismissal.upsert({ where: { userId_itemKey: { userId: user.id, itemKey } }, update: {}, create: { id: crypto.randomUUID(), userId: user.id, itemKey } });
  revalidatePath("/");
}

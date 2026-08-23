"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/data/prisma";

export async function dismissAttentionItem(itemKey: string) {
  if (!/^(document|milestone|custom):[^:]+$/.test(itemKey)) return;
  await prisma.attentionDismissal.upsert({ where: { itemKey }, update: {}, create: { id: crypto.randomUUID(), itemKey } });
  revalidatePath("/");
}

"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/data/prisma";
import { requireKinesisUser, requireRecentVerification } from "@/lib/auth";
import { isSupportedCurrency, isSupportedLocale } from "@/lib/format/preferences";
import { DELETE_ALL_CONFIRMATION } from "./constants";

export type SettingsActionState = { error?: string; message?: string };

export async function updateSettingsAction(
  _state: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const user = await requireKinesisUser();
  const locale = String(formData.get("locale") ?? "");
  const currency = String(formData.get("currency") ?? "");

  // An unrecognised tag makes every Intl constructor throw, so regional values
  // are checked against the supported list rather than stored as submitted.
  if (!isSupportedLocale(locale)) return { error: "Choose a valid region." };
  if (!isSupportedCurrency(currency)) return { error: "Choose a valid currency." };

  const data = {
    locale,
    currency,
    notificationsEnabled: formData.get("notificationsEnabled") === "on",
    remindersEnabled: formData.get("remindersEnabled") === "on",
  };
  await prisma.userSettings.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...data },
    update: data,
  });
  // Dates and amounts appear on every page, so the whole tree is stale.
  revalidatePath("/", "layout");
  return { message: "Settings saved." };
}

export async function deleteAllDataAction(confirmation: string) {
  const verification = await requireRecentVerification();
  if (verification !== true) return verification;
  if (confirmation !== DELETE_ALL_CONFIRMATION) return { error: "Enter the confirmation phrase exactly as shown." };

  const user = await requireKinesisUser();
  const owned = { userId: user.id };

  // Everything the account owns falls into one of three groups, and each row
  // below states which. The statements are independent of one another: every
  // record is removed by its own root, not by the order these happen to run in.
  await prisma.$transaction([
    // 1. Object-backed records, removed through their identity.
    //    Deleting an Object cascades to the typed record that carries it --
    //    Document, Goal, FinanceItem, Person, CustomItem, Todo -- and onward
    //    to everything hanging off those: DocumentField, CustomItemField,
    //    Milestone, GoalMetricSnapshot, Relationship and its ConnectionPractice,
    //    RelationshipReflection, RelationshipImportantDate and RelationshipGoal
    //    rows, plus the shared capabilities keyed on identity: every
    //    ObjectRelationship, and the Notifications tied to a document or
    //    milestone. Seventeen tables, one root.
    prisma.object.deleteMany({ where: owned }),

    // 2. Owned directly by the account and outside the identity layer, so
    //    nothing above reaches them. A Notification need not belong to a
    //    document or milestone, so this clears the ones that do not.
    prisma.notification.deleteMany({ where: owned }),
    prisma.attentionDismissal.deleteMany({ where: owned }),
    prisma.documentType.deleteMany({ where: owned }),
    prisma.goalUnit.deleteMany({ where: owned }),
    prisma.customModule.deleteMany({ where: owned }),
    prisma.userSettings.deleteMany({ where: owned }),
    prisma.activityEvent.deleteMany({ where: owned }),

    // 3. Deliberately kept: SecurityEvent is the account's audit trail, so it
    //    outlives the data it describes and records this deletion too.
    prisma.securityEvent.create({ data: { event: "ALL_DATA_DELETED", userId: user.id } }),
  ]);
  revalidatePath("/", "layout");
  return { success: true };
}

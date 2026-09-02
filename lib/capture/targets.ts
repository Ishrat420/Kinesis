import type { KinesisObjectType } from "@prisma/client";

/**
 * Quick capture (KD-008) records something before the user has decided what it
 * is. This module answers the two questions that follow from that:
 *
 *   1. What can a capture become?
 *   2. Which of the details already typed survive that choice?
 *
 * KD-008 is explicit about why the second question matters: a user may set a
 * due date and then turn the capture into a record that has no such thing.
 * Silently dropping the value is a lie, and carrying it is impossible, so the
 * capture surface has to know -- before it saves anything -- which details the
 * chosen target can hold. Both the command bar and the details step read that
 * from here, so they cannot disagree about it.
 */

/** A detail quick capture can collect before the record it describes exists. */
export const CAPTURE_DETAILS = ["status", "dueDate", "link"] as const;
export type CaptureDetail = (typeof CAPTURE_DETAILS)[number];

/**
 * Query parameters a module's create surface reads to prefill a capture. Only
 * details the target carries are ever put on the URL, so a module never has to
 * decide what to do with a value it has no field for.
 */
export const CAPTURE_TITLE_PARAM = "capture";
export const CAPTURE_SOURCE_PARAM = "from";
export const CAPTURE_DETAIL_PARAMS = { dueDate: "due" } as const satisfies Partial<Record<CaptureDetail, string>>;

type CaptureTargetConfig = {
  label: string;
  /** Where this target sits among the "Create as…" options. */
  order: number;
  /** Whether the command bar offers it directly or behind "More options…". */
  promoted: boolean;
  /** Details this kind of record can actually hold. */
  carries: readonly CaptureDetail[];
  /**
   * The module surface that creates this kind of record, or null when quick
   * capture creates it in place. A capture is never created behind the user's
   * back on a module they have not seen: the surface opens prefilled and they
   * complete the fields only that module requires.
   */
  createPath: string | null;
};

/**
 * The types a capture can become, and what each can carry.
 *
 * `carries` is derived from the target's real shape rather than from what looks
 * convenient:
 *
 *   - To-Do holds all three: status and due date are its own columns, and it
 *     links through the shared ObjectRelationship layer (ADR-009).
 *   - Document carries a link, as a Kinesis Link custom field. It has no due
 *     date -- an expiry is a fact about the document, not an action's deadline
 *     -- and its status is derived from that expiry, not chosen.
 *   - Goal carries a due date, as its target date. Goal links are goal-to-goal
 *     relationships, so an arbitrary linked object has nowhere to go, and a
 *     goal's status is its own vocabulary rather than a To-Do's.
 *
 * Adding Finance, Person or a custom module here is one entry plus prefill
 * support on that module's create surface; nothing else needs to change.
 */
const CAPTURE_TARGETS = {
  TODO: { label: "To-Do", order: 10, promoted: true, carries: ["status", "dueDate", "link"], createPath: null },
  DOCUMENT: { label: "Document", order: 20, promoted: true, carries: ["link"], createPath: "/documents" },
  GOAL: { label: "Goal", order: 30, promoted: true, carries: ["dueDate"], createPath: "/goals" },
} as const satisfies Partial<Record<KinesisObjectType, CaptureTargetConfig>>;

export type CaptureTargetType = keyof typeof CAPTURE_TARGETS;

/** The type a capture becomes when the user just presses Enter. */
export const DEFAULT_CAPTURE_TARGET: CaptureTargetType = "TODO";

export type CaptureTarget = {
  type: CaptureTargetType;
  label: string;
  promoted: boolean;
  carries: readonly CaptureDetail[];
  /** True when quick capture creates the record itself, with no module detour. */
  createdInPlace: boolean;
};

const describe = (type: CaptureTargetType): CaptureTarget => ({
  type,
  label: CAPTURE_TARGETS[type].label,
  promoted: CAPTURE_TARGETS[type].promoted,
  carries: CAPTURE_TARGETS[type].carries,
  createdInPlace: CAPTURE_TARGETS[type].createPath === null,
});

/** Every target, in the order the "Create as…" list should offer them. */
export const captureTargets: CaptureTarget[] = (Object.keys(CAPTURE_TARGETS) as CaptureTargetType[])
  .sort((first, second) => CAPTURE_TARGETS[first].order - CAPTURE_TARGETS[second].order)
  .map(describe);

export const isCaptureTargetType = (value: unknown): value is CaptureTargetType =>
  typeof value === "string" && value in CAPTURE_TARGETS;

export const captureTarget = (type: CaptureTargetType) => describe(type);

/** Whether a target can hold a given captured detail. */
export const captureTargetCarries = (type: CaptureTargetType, detail: CaptureDetail) =>
  (CAPTURE_TARGETS[type].carries as readonly CaptureDetail[]).includes(detail);

/**
 * Which details survive a change of target, and which do not.
 *
 * The caller uses `dropped` to say so before the user commits, rather than
 * discovering afterwards that a due date went nowhere. Only details the user
 * actually set can be dropped: an empty field is nothing to lose.
 */
export function splitCaptureDetails<T extends Partial<Record<CaptureDetail, unknown>>>(
  type: CaptureTargetType,
  details: T,
) {
  const provided = CAPTURE_DETAILS.filter((detail) => {
    const value = details[detail];
    return value !== undefined && value !== null && value !== "";
  });
  return {
    carried: provided.filter((detail) => captureTargetCarries(type, detail)),
    dropped: provided.filter((detail) => !captureTargetCarries(type, detail)),
  };
}

/**
 * Where a capture goes to become this kind of record.
 *
 * `from` names the To-Do a conversion started at, so the module's create action
 * can retire it once the richer record exists. `dueDate` is passed on only when
 * the target carries one -- a Document never receives a due date it has no
 * field for. Returns null for a target quick capture creates itself, which has
 * no surface to send anyone to.
 */
export function captureCreateHref(
  type: CaptureTargetType,
  title: string,
  { from, dueDate }: { from?: string; dueDate?: string } = {},
) {
  const { createPath } = CAPTURE_TARGETS[type];
  if (!createPath) return null;
  const params = new URLSearchParams({ [CAPTURE_TITLE_PARAM]: title });
  if (from) params.set(CAPTURE_SOURCE_PARAM, from);
  if (dueDate && captureTargetCarries(type, "dueDate")) params.set(CAPTURE_DETAIL_PARAMS.dueDate, dueDate);
  return `${createPath}?${params}`;
}

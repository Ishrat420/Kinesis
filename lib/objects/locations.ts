import type { KinesisObjectType, Prisma } from "@prisma/client";

/**
 * Where an Object lives in the application.
 *
 * An Object row says what a record is called and what kind it is, but not the
 * module it belongs to or the route that opens it -- that mapping is a property
 * of the module, not of the identity column. Every surface that offers objects
 * to pick from (Kinesis Link fields, quick capture's "Link to") needs the same
 * mapping, so it is resolved here once rather than rebuilt per picker.
 */

export type ObjectLocation = {
  objectId: string;
  type: KinesisObjectType;
  name: string;
  /** The module the record belongs to, as the user would name it. */
  module: string;
  href: string;
  /** Custom modules bring their own icon and colour; built-ins have a fixed one. */
  icon?: string;
  color: string;
};

/**
 * What a surface needs to present an object as a link target.
 *
 * Both `ObjectLocation` and the narrower `KinesisLinkOption` satisfy this, so
 * one card and one picker render either -- a Kinesis Link custom field and
 * quick capture's "Link to" are the same question about the same objects, and
 * should not look like two different features.
 */
export type LinkableObject = Omit<ObjectLocation, "color"> & { color?: string };

/**
 * The Object columns and relations `locateObject` reads. Callers spread this
 * into their own `select` so a query cannot forget a relation the resolver
 * needs, and adding a locatable type stays a change to this file alone.
 */
export const objectLocationSelect = {
  id: true,
  type: true,
  name: true,
  document: { select: { id: true } },
  goal: { select: { id: true } },
  todo: { select: { id: true } },
  person: { select: { id: true } },
  financeItem: { select: { id: true } },
  customItem: { select: { id: true, module: { select: { id: true, name: true, icon: true, color: true } } } },
} as const satisfies Prisma.ObjectSelect;

export type LocatableObject = Prisma.ObjectGetPayload<{ select: typeof objectLocationSelect }>;

/**
 * Resolves one Object to where it lives, or null when the typed record it names
 * is not attached. A missing record is not an error here: the pickers that use
 * this offer what they can reach and leave out what they cannot.
 */
export function locateObject(object: LocatableObject): ObjectLocation | null {
  const shared = { objectId: object.id, type: object.type, name: object.name };

  if (object.document) return { ...shared, module: "Documents", href: `/documents/${object.document.id}`, color: "#2563eb" };
  if (object.goal) return { ...shared, module: "Goals", href: `/goals/${object.goal.id}`, color: "#7c3aed" };
  if (object.todo) return { ...shared, module: "To-Dos", href: `/todos#todo-${object.todo.id}`, color: "#0d9488" };
  if (object.person) return { ...shared, module: "Relationships", href: "/relationships", color: "#e11d48" };
  if (object.financeItem) return { ...shared, module: "Finance", href: "/finance", color: "#059669" };
  if (object.customItem) {
    const { module } = object.customItem;
    return { ...shared, module: module.name, href: `/custom-modules/${module.id}/items/${object.customItem.id}`, icon: module.icon, color: module.color };
  }
  return null;
}

/** The located objects among a set of rows, skipping any whose record is gone. */
export const locateObjects = (objects: LocatableObject[]): ObjectLocation[] =>
  objects.flatMap((object) => locateObject(object) ?? []);

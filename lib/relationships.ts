export type RelationshipPerson = { id: string; name: string; detail: string; x: number; y: number; size: number; color: string; icon: "user" | "heart" | "baby" | "cat" | "home" };
export type RelationshipRecord = { id: string; from: string; to: string; type: string | null; practices: { title: string; cadence: string }[]; reflections: { text: string; date: string }[]; linkedGoals: string[]; importantDates: { label: string; date: string }[]; notes: string };
export type RelationshipMapData = { people: RelationshipPerson[]; relationships: RelationshipRecord[] };

import { ModuleContent } from "@/components/layout/ModuleContent";
import { RelationshipMap } from "./RelationshipMap";
import { getGoalsForLinking } from "@/lib/data/goals";
import { getCurrentUser, getUserDisplayName } from "@/lib/data/user";
import { getRelationshipMap } from "@/lib/data/relationships";

export default async function RelationshipsPage() {
  const [goals, user] = await Promise.all([getGoalsForLinking(), getCurrentUser()]);
  const relationshipMap = await getRelationshipMap(getUserDisplayName(user));
  return (
    <ModuleContent width="full">
      <RelationshipMap goals={goals} userDisplayName={getUserDisplayName(user)} initialData={relationshipMap} />
    </ModuleContent>
  );
}

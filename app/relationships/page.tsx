import { Sidebar } from "@/components/navigation/Sidebar";
import { Topbar } from "@/components/navigation/Topbar";
import { RelationshipMap } from "./RelationshipMap";
import { getGoalsForLinking } from "@/lib/data/goals";
import { getCurrentUser, getUserDisplayName } from "@/lib/data/user";

export default async function RelationshipsPage() {
  const [goals, user] = await Promise.all([getGoalsForLinking(), getCurrentUser()]);
  return (
    <main className="min-h-screen bg-[#f7f8fb] text-zinc-950">
      <Topbar />
      <div className="flex">
        <Sidebar />
        <RelationshipMap goals={goals} userDisplayName={getUserDisplayName(user)} />
      </div>
    </main>
  );
}

import { Sidebar } from "@/components/navigation/Sidebar";
import { Topbar } from "@/components/navigation/Topbar";
import { RelationshipMap } from "./RelationshipMap";
import { getGoalsForLinking } from "@/lib/data/goals";

export default async function RelationshipsPage() {
  const goals = await getGoalsForLinking();
  return (
    <main className="min-h-screen bg-[#f7f8fb] text-zinc-950">
      <Topbar />
      <div className="flex">
        <Sidebar />
        <RelationshipMap goals={goals} />
      </div>
    </main>
  );
}

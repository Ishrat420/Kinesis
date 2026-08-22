import { Sidebar } from "@/components/navigation/Sidebar";
import { Topbar } from "@/components/navigation/Topbar";
import { RelationshipMap } from "./RelationshipMap";

export default function RelationshipsPage() {
  return (
    <main className="min-h-screen bg-[#f7f8fb] text-zinc-950">
      <Topbar />
      <div className="flex">
        <Sidebar />
        <RelationshipMap />
      </div>
    </main>
  );
}

import { User } from "lucide-react";
import { getRecentNotifications } from "@/lib/data/notifications";
import { getDocuments } from "@/lib/data/documents";
import { getGoalsForLinking } from "@/lib/data/goals";
import { SearchBar } from "@/components/ui/SearchBar";
import { NotificationBell } from "./NotificationBell";
import Link from "next/link";
import { getCurrentUser, getUserDisplayName } from "@/lib/data/user";
import { getFinanceItems } from "@/lib/data/finance";
import { getRelationshipMap } from "@/lib/data/relationships";

export async function Topbar() {
  const [{ notifications, unreadCount }, documents, goals, user, financeItems] = await Promise.all([
    getRecentNotifications(),
    getDocuments(),
    getGoalsForLinking(),
    getCurrentUser(),
    getFinanceItems(),
  ]);
  const relationshipMap = await getRelationshipMap(getUserDisplayName(user));

  return (
    <header className="sticky top-0 z-30 h-[72px] border-b border-zinc-200/80 bg-white/90 backdrop-blur">
      <div className="relative flex h-full items-center justify-end px-4 sm:px-8">
        <div className="absolute left-4 right-32 flex justify-center sm:left-8 sm:right-40">
          <SearchBar
            documents={documents.map(({ id, name, type }) => ({ id, name, type }))}
            goals={goals}
            financeItems={financeItems}
            people={relationshipMap.people.map((person) => person.detail === "You" ? { ...person, name: getUserDisplayName(user) } : person)}
            relationships={relationshipMap.relationships}
          />
        </div>

        <div className="relative flex items-center gap-3">
          <NotificationBell key={`${unreadCount}:${notifications.map(({ id, readAt }) => `${id}:${readAt?.getTime() ?? "unread"}`).join(",")}`} notifications={notifications} initialUnreadCount={unreadCount} />

          <Link href="/user" aria-label="Open user profile" className="flex h-11 w-11 items-center justify-center rounded-full border border-zinc-200/80 bg-white shadow-sm transition hover:-translate-y-0.5 hover:bg-zinc-50 hover:shadow-md">
            <User className="h-[18px] w-[18px]" />
          </Link>
        </div>
      </div>
    </header>
  );
}

"use client";

import { Bell, CalendarClock, CheckCheck, Clock3, Flag, Heart, ListTodo, Puzzle, TriangleAlert, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { markAllNotificationsReadAction, markNotificationReadAction } from "./notification-actions";
import { formatDate } from "@/lib/dates";
import { useFormatPreferences } from "@/lib/format/context";

type NotificationItem = {
  id: string;
  type: "REMINDER_DUE" | "EXPIRED" | "MILESTONE_DUE" | "CUSTOM_ITEM_DUE" | "TODO_DUE";
  message: string;
  documentName: string;
  documentType: string | null;
  reminderAt: Date | null;
  expiryDate: Date | null;
  actionUrl: string;
  readAt: Date | null;
  createdAt: Date;
};

export function NotificationBell({ notifications, initialUnreadCount }: { notifications: NotificationItem[]; initialUnreadCount: number }) {
  const { locale } = useFormatPreferences();
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [readIds, setReadIds] = useState(() => new Set(notifications.filter((item) => item.readAt).map((item) => item.id)));
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function close(event: MouseEvent) {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  function read(notification: NotificationItem) {
    if (!readIds.has(notification.id)) {
      setReadIds((ids) => new Set(ids).add(notification.id));
      setUnreadCount((count) => Math.max(0, count - 1));
      void markNotificationReadAction(notification.id);
    }
  }

  function readAll() {
    setReadIds(new Set(notifications.map((item) => item.id)));
    setUnreadCount(0);
    void markAllNotificationsReadAction();
  }

  return (
    <div ref={container} className="relative">
      <button type="button" aria-label={`${unreadCount} unread notifications`} aria-expanded={open} onClick={() => setOpen((value) => !value)} className="relative flex h-11 min-w-11 items-center justify-center rounded-full border border-zinc-200/80 bg-white px-3 shadow-sm transition hover:-translate-y-0.5 hover:bg-zinc-50 hover:shadow-md">
        <Bell className="h-[18px] w-[18px]" />
        {unreadCount > 0 && <span className="ml-1.5 rounded-full bg-zinc-900 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">{unreadCount > 99 ? "99+" : unreadCount}</span>}
      </button>

      {open && <button type="button" aria-label="Close notifications" className="fixed inset-0 z-40 bg-zinc-950/10 backdrop-blur-[1px] sm:bg-transparent sm:backdrop-blur-none" onClick={() => setOpen(false)} />}
      {open && (
        <section aria-label="Notifications" className="fixed inset-x-3 top-20 z-50 max-h-[calc(100dvh-6rem)] overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-[0_24px_80px_rgb(0,0,0,0.2)] sm:absolute sm:inset-x-auto sm:right-0 sm:top-14 sm:w-[420px]">
          <div className="flex items-start justify-between gap-4 border-b border-zinc-100 px-5 py-4">
            <div><h2 className="font-semibold text-zinc-950">Notifications</h2><p className="mt-0.5 text-xs text-zinc-500">{unreadCount ? `${unreadCount} need your attention` : "You're all caught up"}</p></div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && <button type="button" onClick={readAll} className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-950"><CheckCheck className="h-4 w-4" />Mark all read</button>}
              <button type="button" aria-label="Close notifications" onClick={() => setOpen(false)} className="rounded-lg p-2 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-950"><X className="h-4 w-4" /></button>
            </div>
          </div>
          <div className="max-h-[calc(100dvh-11rem)] overflow-y-auto p-2 sm:max-h-[480px]">
            {notifications.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-zinc-500"><Bell className="mx-auto mb-3 h-6 w-6 text-zinc-300" />No notifications yet</div>
            ) : notifications.map((notification) => {
              const isMilestone = notification.type === "MILESTONE_DUE" || notification.actionUrl.startsWith("/goals/");
              const isRelationshipDate = notification.actionUrl === "/relationships";
              const isCustomItem = notification.type === "CUSTOM_ITEM_DUE" || notification.actionUrl.startsWith("/custom-modules/");
              const isTodo = notification.type === "TODO_DUE" || notification.actionUrl === "/todos";
              return (
              <Link key={notification.id} href={notification.actionUrl} onClick={() => read(notification)} className={`group flex gap-3 rounded-2xl px-3 py-3.5 transition hover:bg-zinc-50 ${readIds.has(notification.id) ? "opacity-70" : "bg-zinc-50/70"}`}>
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${notification.type === "EXPIRED" ? "bg-red-50 text-red-600" : isMilestone ? "bg-violet-50 text-violet-700" : isRelationshipDate ? "bg-rose-50 text-rose-700" : isCustomItem ? "bg-sky-50 text-sky-700" : isTodo ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                  {notification.type === "EXPIRED" ? <TriangleAlert className="h-5 w-5" /> : isMilestone ? <Flag className="h-5 w-5" /> : isRelationshipDate ? <Heart className="h-5 w-5" /> : isCustomItem ? <Puzzle className="h-5 w-5" /> : isTodo ? <ListTodo className="h-5 w-5" /> : <CalendarClock className="h-5 w-5" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-start justify-between gap-3"><span className="block text-sm font-semibold leading-5 text-zinc-900">{notification.documentName}</span>{!readIds.has(notification.id) && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-500" />}</span>
                  <span className="mt-0.5 block text-sm leading-5 text-zinc-600">{notification.message}</span>
                  <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-400"><span className="flex items-center gap-1"><Clock3 className="h-3 w-3" />{notification.documentType ?? "Document"}</span>{notification.expiryDate && <span>{isMilestone || isCustomItem || isTodo ? "Due" : isRelationshipDate ? "Occurs" : "Expires"} {formatDate(notification.expiryDate, locale)}</span>}</span>
                </span>
              </Link>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

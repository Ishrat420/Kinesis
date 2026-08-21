"use client";

import { Bell, Clock3 } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { markNotificationReadAction } from "./notification-actions";

type NotificationItem = {
  id: string;
  message: string;
  documentType: string | null;
  actionUrl: string;
  readAt: Date | null;
  createdAt: Date;
};

export function NotificationBell({ notifications, initialUnreadCount }: { notifications: NotificationItem[]; initialUnreadCount: number }) {
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function close(event: MouseEvent) {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  function read(notification: NotificationItem) {
    if (!notification.readAt) {
      setUnreadCount((count) => Math.max(0, count - 1));
      void markNotificationReadAction(notification.id);
    }
  }

  return (
    <div ref={container} className="relative">
      <button type="button" aria-label={`${unreadCount} unread notifications`} aria-expanded={open} onClick={() => setOpen((value) => !value)} className="relative flex h-11 min-w-11 items-center justify-center rounded-full border border-zinc-200/80 bg-white px-3 shadow-sm transition hover:-translate-y-0.5 hover:bg-zinc-50 hover:shadow-md">
        <Bell className="h-[18px] w-[18px]" />
        {unreadCount > 0 && <span className="ml-1.5 rounded-full bg-zinc-900 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">{unreadCount > 99 ? "99+" : unreadCount}</span>}
      </button>

      {open && (
        <section className="absolute right-0 top-14 z-50 w-[380px] overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-[0_20px_60px_rgb(0,0,0,0.14)]">
          <div className="border-b border-zinc-100 px-5 py-4">
            <h2 className="font-semibold text-zinc-900">Notifications</h2>
            <p className="mt-0.5 text-xs text-zinc-500">{unreadCount ? `${unreadCount} unread` : "You're all caught up"}</p>
          </div>
          <div className="max-h-[420px] overflow-y-auto p-2">
            {notifications.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-zinc-500"><Bell className="mx-auto mb-3 h-6 w-6 text-zinc-300" />No notifications yet</div>
            ) : notifications.map((notification) => (
              <Link key={notification.id} href={notification.actionUrl} onClick={() => read(notification)} className="flex gap-3 rounded-xl px-3 py-3 transition hover:bg-zinc-50">
                <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${notification.readAt ? "bg-zinc-200" : "bg-blue-500"}`} />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-zinc-800">{notification.message}</span>
                  <span className="mt-1 flex items-center gap-1 text-xs text-zinc-400"><Clock3 className="h-3 w-3" />{notification.documentType ?? "Document"}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

"use client";

import { Bell, CalendarClock, CheckCheck, Clock3, Flag, Heart, ListTodo, TriangleAlert, X } from "lucide-react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { markAllNotificationsReadAction, markNotificationReadAction } from "./notification-actions";
import { CustomModuleBadge } from "@/lib/custom-modules/icons";
import { formatDate } from "@/lib/dates";
import { useFormatPreferences } from "@/lib/format/context";
import type { NotificationSource } from "@/lib/notifications/identity";
import { Z_INDEX } from "@/lib/layout/z-index";

/**
 * Notifications are derived rather than stored, so a row has no database id to
 * be known by. `key` is its identity -- the record, what is being said and the
 * deadline it is about -- and it is what marking one read records.
 */
type NotificationItem = {
  key: string;
  source: NotificationSource;
  sourceId: string;
  type: "REMINDER_DUE" | "EXPIRED" | "MILESTONE_DUE" | "CUSTOM_ITEM_DUE" | "TODO_DUE";
  message: string;
  documentName: string;
  documentType: string | null;
  reminderAt: Date | null;
  expiryDate: Date | null;
  actionUrl: string;
  readAt: Date | null;
  /** Set for a custom item's notification, so it wears its own module's icon and colour. */
  moduleIcon: string | null;
  moduleColor: string | null;
};

/** Where the panel sits, in viewport pixels -- computed from the trigger button once it is portaled out of it. Unset on narrow screens, where the panel is a fixed bottom sheet instead. */
type Anchor = { top: number; right: number };

const DESKTOP_QUERY = "(min-width: 640px)";

export function NotificationBell({ notifications, initialUnreadCount }: { notifications: NotificationItem[]; initialUnreadCount: number }) {
  const { locale } = useFormatPreferences();
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [readKeys, setReadKeys] = useState(() => new Set(notifications.filter((item) => item.readAt).map((item) => item.key)));
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function close(event: MouseEvent) {
      const target = event.target as Node;
      if (container.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  /**
   * The panel is portaled to `document.body` (see below) so the top bar's
   * `backdrop-blur` -- which makes it the containing block, and a stacking
   * context, for anything `fixed` inside it -- cannot trap it the way it once
   * trapped Modal and MobileNavDrawer. Escaping to `document.body` means the
   * panel can no longer be positioned relative to the trigger via CSS, so its
   * position is measured here instead, and only on desktop -- the mobile
   * layout is a viewport-anchored bottom sheet regardless of where the button
   * sits.
   */
  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      if (!window.matchMedia(DESKTOP_QUERY).matches) { setAnchor(null); return; }
      const rect = container.current?.getBoundingClientRect();
      if (rect) setAnchor({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [open]);

  function read(notification: NotificationItem) {
    if (!readKeys.has(notification.key)) {
      setReadKeys((keys) => new Set(keys).add(notification.key));
      setUnreadCount((count) => Math.max(0, count - 1));
      void markNotificationReadAction(notification.key, notification.source, notification.sourceId);
    }
  }

  function readAll() {
    setReadKeys(new Set(notifications.map((item) => item.key)));
    setUnreadCount(0);
    void markAllNotificationsReadAction();
  }

  return (
    <div ref={container} className="relative">
      <button type="button" aria-label={`${unreadCount} unread notifications`} aria-expanded={open} onClick={() => setOpen((value) => !value)} className="relative flex h-11 min-w-11 items-center justify-center rounded-full border border-zinc-200/80 bg-white px-3 shadow-sm transition hover:-translate-y-0.5 hover:bg-zinc-50 hover:shadow-md">
        <Bell className="h-[18px] w-[18px]" />
        {unreadCount > 0 && <span className="ml-1.5 rounded-full bg-zinc-900 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">{unreadCount > 99 ? "99+" : unreadCount}</span>}
      </button>

      {/*
        The scrim is sized rather than inset because before this portaled, the
        top bar's backdrop-filter made it the containing block for anything
        fixed inside it: `inset-0` gave this the 72px header to cover, not the
        page behind the panel. Portaling to `document.body` removes that trap,
        but the bar is still pinned to the top of the viewport, so the same
        explicit viewport height keeps covering exactly the page below it.
      */}
      {open && typeof document !== "undefined" && createPortal(
        <div ref={panelRef}>
          <button type="button" aria-label="Close notifications" className={`fixed inset-x-0 top-0 ${Z_INDEX.banner} h-[100dvh] bg-zinc-950/10 backdrop-blur-[1px] sm:bg-transparent sm:backdrop-blur-none`} onClick={() => setOpen(false)} />
          <section
            aria-label="Notifications"
            style={anchor ? { top: anchor.top, right: anchor.right } : undefined}
            className={`fixed inset-x-3 top-20 ${Z_INDEX.overlay} max-h-[calc(100dvh-6rem)] overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-[0_24px_80px_rgb(0,0,0,0.2)] sm:inset-x-auto sm:w-[420px]`}
          >
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
              <Link key={notification.key} href={notification.actionUrl} onClick={() => read(notification)} className={`group flex gap-3 rounded-2xl px-3 py-3.5 transition hover:bg-zinc-50 ${readKeys.has(notification.key) ? "opacity-70" : "bg-zinc-50/70"}`}>
                {isCustomItem && notification.moduleIcon && notification.moduleColor
                  ? <CustomModuleBadge icon={notification.moduleIcon} color={notification.moduleColor} className="h-10 w-10 rounded-xl" iconClassName="h-5 w-5" />
                  : <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${notification.type === "EXPIRED" ? "bg-red-50 text-red-600" : isMilestone ? "bg-violet-50 text-violet-700" : isRelationshipDate ? "bg-rose-50 text-rose-700" : isCustomItem ? "bg-sky-50 text-sky-700" : isTodo ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                      {notification.type === "EXPIRED" ? <TriangleAlert className="h-5 w-5" /> : isMilestone ? <Flag className="h-5 w-5" /> : isRelationshipDate ? <Heart className="h-5 w-5" /> : isTodo ? <ListTodo className="h-5 w-5" /> : <CalendarClock className="h-5 w-5" />}
                    </span>}
                <span className="min-w-0 flex-1">
                  <span className="flex items-start justify-between gap-3"><span className="block text-sm font-semibold leading-5 text-zinc-900">{notification.documentName}</span>{!readKeys.has(notification.key) && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-500" />}</span>
                  <span className="mt-0.5 block text-sm leading-5 text-zinc-600">{notification.message}</span>
                  <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-400"><span className="flex items-center gap-1"><Clock3 className="h-3 w-3" />{notification.documentType ?? "Document"}</span>{notification.expiryDate && <span>{isMilestone || isCustomItem || isTodo ? "Due" : isRelationshipDate ? "Occurs" : "Expires"} {formatDate(notification.expiryDate, locale)}</span>}</span>
                </span>
              </Link>
              );
            })}
          </div>
          </section>
        </div>,
        document.body,
      )}
    </div>
  );
}

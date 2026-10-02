/**
 * The dashboard's stat tiles (StatsGrid and NeedsAttentionCard), compact on a
 * phone and as before from sm up. Shared so the five tiles can't drift apart.
 */
export const STAT_TILE_CLASS = "group rounded-2xl border border-zinc-200/80 bg-white p-3.5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition duration-200 hover:-translate-y-1 hover:shadow-[0_16px_45px_rgb(0,0,0,0.08)] sm:rounded-3xl sm:p-5";
export const STAT_TILE_HEADER_CLASS = "flex items-center gap-2 sm:gap-3";
export const STAT_TILE_ICON_BOX_CLASS = "flex h-7 w-7 shrink-0 items-center justify-center rounded-xl sm:h-9 sm:w-9 sm:rounded-2xl";
export const STAT_TILE_ICON_CLASS = "h-4 w-4 text-zinc-700 sm:h-[18px] sm:w-[18px]";
export const STAT_TILE_TITLE_CLASS = "min-w-0 text-xs font-semibold text-zinc-700 sm:text-sm";
export const STAT_TILE_BODY_CLASS = "mt-3 sm:mt-6";
export const STAT_TILE_VALUE_CLASS = "text-2xl font-semibold leading-none tracking-tight sm:text-[38px]";
export const STAT_TILE_LABEL_CLASS = "mt-1 text-xs text-zinc-500 sm:mt-2 sm:text-sm";
/** The whole tile is tappable, so on a phone this line only costs height. */
export const STAT_TILE_SEE_ALL_CLASS = "mt-6 hidden text-sm font-medium text-zinc-500 transition group-hover:text-zinc-900 sm:block";

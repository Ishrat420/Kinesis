/** How many rows a dashboard list shows on a phone before "Show all". */
export const PHONE_LIST_LIMIT = 5;

/**
 * Give a row this class when its index is PHONE_LIST_LIMIT or more: on a
 * phone it stays hidden until "Show all" is tapped (see PhoneListLimit). From
 * sm up it does nothing, and the list keeps its fixed-height scroll box.
 */
export const BEYOND_PHONE_LIMIT_CLASS = "group-data-[collapsed]/limit:max-sm:hidden";

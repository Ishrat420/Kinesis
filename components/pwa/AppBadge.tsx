"use client";

import { useEffect } from "react";
import { setAppBadge } from "./browser";

/**
 * Keeps the Home Screen icon's number in step with the bell while Kinesis is
 * open: it updates the moment something is marked read here, rather than
 * waiting for the next push to correct it. Renders nothing.
 */
export function AppBadge({ count }: { count: number }) {
  useEffect(() => setAppBadge(count), [count]);
  return null;
}

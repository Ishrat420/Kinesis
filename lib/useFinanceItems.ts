"use client";

import { useSyncExternalStore } from "react";
import {
  defaultFinanceItems,
  FINANCE_STORAGE_KEY,
  type FinanceItem,
} from "@/lib/finance";

const changeEvent = "kinesis-finance-change";
let cachedValue: string | null | undefined;
let cachedItems = defaultFinanceItems;

function getSnapshot() {
  const value = window.localStorage.getItem(FINANCE_STORAGE_KEY);
  if (value === cachedValue) return cachedItems;

  cachedValue = value;
  if (!value) return (cachedItems = defaultFinanceItems);

  try {
    return (cachedItems = JSON.parse(value) as FinanceItem[]);
  } catch {
    return (cachedItems = defaultFinanceItems);
  }
}

function subscribe(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(changeEvent, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(changeEvent, onStoreChange);
  };
}

export function useFinanceItems() {
  return useSyncExternalStore(subscribe, getSnapshot, () => defaultFinanceItems);
}

export function saveFinanceItems(items: FinanceItem[]) {
  window.localStorage.setItem(FINANCE_STORAGE_KEY, JSON.stringify(items));
  window.dispatchEvent(new Event(changeEvent));
}

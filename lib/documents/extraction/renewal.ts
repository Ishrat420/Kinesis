import type { FieldSuggestions, TodoSuggestion } from "./suggest";

/**
 * For a file with no to-do of its own (a passport, a licence) when the user
 * asks for one anyway: renewing it, by its expiry. Already expired, it is due
 * today -- a date in the past would make the new to-do overdue from the
 * moment it's saved, and by years for an old card.
 */
export function renewalTodo(document: FieldSuggestions, today: string): TodoSuggestion {
  const name = document.name ?? document.type;
  const dueDate = document.expiryDate && (document.expiryDate < today ? today : document.expiryDate);
  return { title: name ? `Renew ${name.toLowerCase()}` : "", ...(dueDate ? { dueDate } : {}) };
}

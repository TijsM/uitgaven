// Expenses saved while offline, kept on the device until they can be sent to Notion.
import type { Expense } from "@/lib/notion";

export type Queued = { id: string; expense: Expense; queuedAt: number };

const KEY = "outbox";

export function readOutbox(): Queued[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

function write(items: Queued[]) {
  localStorage.setItem(KEY, JSON.stringify(items));
}

export function enqueue(expense: Expense): Queued[] {
  const items = [...readOutbox(), { id: crypto.randomUUID(), expense, queuedAt: Date.now() }];
  write(items);
  return items;
}

export function dequeue(id: string): Queued[] {
  const items = readOutbox().filter((q) => q.id !== id);
  write(items);
  return items;
}

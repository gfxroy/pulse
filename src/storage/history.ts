import type { HistoryEntry, CompositeResult } from '../types';

const KEY = 'pulse-wellness-history-v1';
const MAX = 50;

export function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as HistoryEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveHistoryEntry(result: CompositeResult, label?: string): HistoryEntry {
  const entry: HistoryEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    result,
    label,
  };
  const list = loadHistory();
  list.unshift(entry);
  localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  return entry;
}

export function clearHistory(): void {
  localStorage.removeItem(KEY);
}

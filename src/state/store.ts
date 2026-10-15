// Helpers for state kept in story storage: values typed into inputs, and ordered lists of ids.

/** Text from storage, which may hold anything an input saved. */
export function text(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value)
}

/** A whole, non-negative number from storage, which may hold a number or the text of an input. */
export function count(value: unknown, fallback: number): number {
  if (value === '' || value == null) return fallback
  const n = Number(value)
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : fallback
}

/** An ordered list of ids kept under `key`. */
export async function idList(key: string): Promise<string[]> {
  const ids = await api.v1.storyStorage.get(key)
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : []
}

/** Moves `id` one place up (-1) or down (+1) in the list under `key`. */
export async function moveInList(key: string, id: string, delta: -1 | 1): Promise<void> {
  const ids = await idList(key)
  const from = ids.indexOf(id)
  const to = from + delta
  if (from < 0 || to < 0 || to >= ids.length) return
  ;[ids[from], ids[to]] = [ids[to], ids[from]]
  await api.v1.storyStorage.set(key, ids)
}

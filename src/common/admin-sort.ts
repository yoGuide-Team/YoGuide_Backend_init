/// Generic `?sortBy=&sortDir=` support for admin list endpoints. Only
/// fields in `allowed` can be sorted on (prevents sorting by relation
/// fields Prisma can't order by directly, or leaking column names that
/// don't exist). Falls back to `fallback` when sortBy is missing/invalid.
export function parseAdminSort<T extends string>(
  sortBy: string | undefined,
  sortDir: string | undefined,
  allowed: readonly T[],
  fallback: Record<string, 'asc' | 'desc'>,
): Record<string, 'asc' | 'desc'> {
  if (!sortBy || !allowed.includes(sortBy as T)) return fallback;
  const dir: 'asc' | 'desc' = sortDir === 'desc' ? 'desc' : 'asc';
  return { [sortBy]: dir };
}

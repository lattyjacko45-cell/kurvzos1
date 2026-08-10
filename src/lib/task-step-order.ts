/** True only when orderedIds is the exact set of knownIds, with no repeats. */
export function containsEveryIdExactlyOnce(
  orderedIds: readonly string[],
  knownIds: readonly string[]
): boolean {
  if (orderedIds.length !== knownIds.length) return false;

  const ordered = new Set(orderedIds);
  if (ordered.size !== orderedIds.length) return false;

  const known = new Set(knownIds);
  return known.size === knownIds.length && knownIds.every((id) => ordered.has(id));
}

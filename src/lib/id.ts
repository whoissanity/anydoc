/** Session-unique ids for annotations, form drafts and inserted images; crypto rather than Math.random so collisions stay improbable. */
export function newId(): string {
  return crypto.randomUUID();
}

/**
 * @param {{ profile?: { displayName?: string | null } | null, emailNormalized?: string | null } | null | undefined} actor
 * @param {string | null | undefined} actorType
 */
export function auditActorLabel(actor, actorType = null) {
  return actor?.profile?.displayName || actor?.emailNormalized || actorType || "Administrator";
}

/**
 * @param {string} role
 * @param {string[]} permissions
 */
export function permissionSummary(role, permissions) {
  if (role === "ROOT_ADMIN") return "Full access";
  return permissions.length ? permissions.map((value) => value.toLowerCase().replaceAll("_", " ")).join(", ") : "None";
}

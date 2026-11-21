export function formatAdminDate(value: string | Date | null | undefined, includeTime = false): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.valueOf())) return "—";
  return new Intl.DateTimeFormat("en-IN", includeTime
    ? { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }
    : { dateStyle: "medium", timeZone: "Asia/Kolkata" }).format(date);
}

export function adminStatusLabel(value: string): string {
  return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

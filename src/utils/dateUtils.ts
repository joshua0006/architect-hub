import { format, parseISO, isValid } from "date-fns";
import { zonedTimeToUtc, utcToZonedTime, format as formatTz } from "date-fns-tz";

export function formatDateToTimezone(
  date: string | Date | null | undefined,
  timezone: string,
  formatStr: string = "MMM d, yyyy h:mm aa"
): string {
  try {
    if (!date) return "Never";

    const parsedDate = typeof date === "string" ? parseISO(date) : date;
    if (!isValid(parsedDate)) return "Invalid date";

    // Convert to the specified timezone
    const zonedDate = utcToZonedTime(parsedDate, timezone);
    
    // Format with timezone information
    return formatTz(zonedDate, formatStr, { timeZone: timezone });
  } catch (error) {
    console.error("Error formatting date:", error);
    return "Never";
  }
}

export function convertToUTC(date: Date, timezone: string): Date {
  return zonedTimeToUtc(date, timezone);
}

export function isOverdue(
  dueDate: string,
  status: string,
  timezone: string
): boolean {
  if (status === "completed") return false;

  try {
    const parsedDate = parseISO(dueDate);
    if (!isValid(parsedDate)) return false;

    // Get current time in the specified timezone
    const now = utcToZonedTime(new Date(), timezone);
    const zonedDueDate = utcToZonedTime(parsedDate, timezone);

    // Compare dates in the specified timezone
    return zonedDueDate < now;
  } catch (error) {
    console.error("Error checking overdue status:", error);
    return false;
  }
}

export function getCurrentTimezoneOffset(timezone: string): string {
  const now = new Date();
  const zonedDate = utcToZonedTime(now, timezone);
  return formatTz(zonedDate, "xxxxx", { timeZone: timezone }); // Returns offset in format +HH:mm
}
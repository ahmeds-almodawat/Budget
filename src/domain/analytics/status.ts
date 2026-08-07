export type InvoiceMatchStatusKey =
  | "matched"
  | "matchedWithinTolerance"
  | "exception"
  | "overridden"
  | "unknown";

export function invoiceMatchStatusKey(status: string | null | undefined): InvoiceMatchStatusKey {
  switch (status) {
    case "matched":
      return "matched";
    case "matched_within_tolerance":
      return "matchedWithinTolerance";
    case "exception":
      return "exception";
    case "overridden":
      return "overridden";
    default:
      return "unknown";
  }
}

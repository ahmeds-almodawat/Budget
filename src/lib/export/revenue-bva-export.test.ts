import { describe, it, expect } from "vitest";
import { mapRevenueExportRows, buildExportFilename } from "@/lib/export/revenue-bva-export";
import { rowsToSafeCsv, neutralizeCsvCell } from "@/lib/export/spreadsheet-safe";

describe("revenue BVA export", () => {
  it("maps exact numeric export values", () => {
    const rows = mapRevenueExportRows([
      {
        legal_entity_id: "11111111-1111-1111-1111-111111111102",
        control_scope_id: "55555555-5555-5555-5555-555555555502",
        fiscal_period_id: "fp-1",
        period_number: 3,
        organization_unit_id: "33333333-3333-3333-3333-333333333304",
        payer_id: "p-1",
        payer_category_id: "pc-1",
        service_line_id: "sl-1",
        budgeted_revenue: 100000,
        gross_actual_revenue: 110000,
        rejection_amount: 5000,
        discount_amount: 2000,
        refund_amount: 0,
        credit_note_amount: 0,
        other_deduction_amount: 0,
        actual_net_revenue: 103000,
        external_net_revenue: 103000,
        internal_revenue: 0,
        revenue_variance: 3000,
        revenue_variance_percentage: 0.03,
        attainment_percentage: 1.03,
      },
    ]);
    expect(rows[0].revenue_budget).toBe(100000);
    expect(rows[0].variance).toBe(3000);
    expect(rows[0].external_net_revenue).toBe(103000);
  });

  it("builds deterministic filename with report type and date", () => {
    expect(buildExportFilename("revenue-detail", new Date("2027-03-15T12:00:00Z"))).toBe(
      "revenue-detail-2027-03-15.csv",
    );
  });

  it("neutralizes formula injection in Arabic and English text fields", () => {
    expect(neutralizeCsvCell("=SUM(A1:A2)", "text")).toBe("'=SUM(A1:A2)");
    expect(neutralizeCsvCell("+CMD|'/c calc'!A0", "text")).toBe("'+CMD|'/c calc'!A0");
    expect(neutralizeCsvCell("-CMD|x", "text")).toBe("'-CMD|x");
    expect(neutralizeCsvCell("@SUM(A1)", "text")).toBe("'@SUM(A1)");
    expect(neutralizeCsvCell("وصف المستفيد", "text")).toBe("وصف المستفيد");
    expect(neutralizeCsvCell("Government Payer", "text")).toBe("Government Payer");
  });

  it("preserves legitimate negative numeric financial values", () => {
    const csv = rowsToSafeCsv([{ amount: -1500.75, label: "=risky" }]);
    expect(csv).toContain("-1500.75");
    expect(csv).toContain(`"'=risky"`);
  });

  it("escapes quotes and commas in CSV fields", () => {
    const csv = rowsToSafeCsv([{ note: 'Say "hello", world' }]);
    expect(csv).toContain('Say ""hello"", world');
  });

  it("escapes line breaks in CSV text fields", () => {
    const csv = rowsToSafeCsv([{ note: "line1\nline2" }]);
    expect(csv).toContain('"line1\nline2"');
  });
});

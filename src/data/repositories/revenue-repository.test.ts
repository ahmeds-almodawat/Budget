import { describe, it, expect, vi } from "vitest";
import { getRevenueBudgetVsActual } from "@/data/repositories/revenue-repository";
import { DataAccessError } from "@/data/repositories/budget-repository";

describe("revenue repository error handling", () => {
  it("transforms database errors into DataAccessError", async () => {
    const errorResult = { data: null, error: { message: "permission denied" } };
    const chain = {
      eq: vi.fn().mockReturnThis(),
      then: (resolve: (v: typeof errorResult) => void) => resolve(errorResult),
    };
    const mockDb = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue(chain),
      }),
    } as unknown as Parameters<typeof getRevenueBudgetVsActual>[0];

    await expect(
      getRevenueBudgetVsActual(mockDb, "11111111-1111-1111-1111-111111111102"),
    ).rejects.toBeInstanceOf(DataAccessError);
  });
});

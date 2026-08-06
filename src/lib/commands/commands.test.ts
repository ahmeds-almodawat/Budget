import { describe, it, expect } from "vitest";
import { assertCommandOk } from "@/lib/commands/types";

describe("command result helpers", () => {
  it("assertCommandOk returns successful results", () => {
    const result = assertCommandOk({ ok: true, entity_id: "abc" });
    expect(result.entity_id).toBe("abc");
  });

  it("assertCommandOk throws on failure", () => {
    expect(() => assertCommandOk({ ok: false, error_code: "STATE_MISMATCH", message: "bad state" })).toThrow(
      "[STATE_MISMATCH] bad state",
    );
  });
});

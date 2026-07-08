import { describe, it, expect } from "vitest";
import { estimateGradedValues } from "./gradedEstimate";

describe("estimateGradedValues", () => {
  it("returns nothing for a missing or zero raw price", () => {
    expect(estimateGradedValues(null, "USD", 9)).toEqual([]);
    expect(estimateGradedValues(0, "USD", 9)).toEqual([]);
  });

  it("estimates the predicted grade plus the PSA-10 ceiling", () => {
    const out = estimateGradedValues(100, "USD", 9);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ label: "PSA 9 (est.)", amount: 200, estimated: true });
    expect(out[1]).toMatchObject({ label: "PSA 10 ceiling (est.)", amount: 500 });
  });

  it("omits the ceiling when the prediction is already a 10", () => {
    const out = estimateGradedValues(100, "USD", 10);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ label: "PSA 10 (est.)", amount: 500 });
  });

  it("carries the currency through", () => {
    const out = estimateGradedValues(50, "EUR", 8);
    expect(out.every((p) => p.currency === "EUR")).toBe(true);
  });
});

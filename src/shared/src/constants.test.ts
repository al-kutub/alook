import { describe, it, expect } from "vitest";
import { computeBudgetUtilizationPercent, isOverBudget } from "./constants";

describe("isOverBudget", () => {
  it("never blocks when budget is null (unlimited)", () => {
    expect(isOverBudget(null, 0)).toBe(false);
    expect(isOverBudget(null, 999_999)).toBe(false);
  });

  it("blocks once spent equals budget", () => {
    expect(isOverBudget(1000, 1000)).toBe(true);
  });

  it("blocks once spent exceeds budget", () => {
    expect(isOverBudget(1000, 1500)).toBe(true);
  });

  it("allows when spent is under budget", () => {
    expect(isOverBudget(1000, 999)).toBe(false);
  });

  it("a zero budget blocks immediately, even at zero spend", () => {
    expect(isOverBudget(0, 0)).toBe(true);
  });
});

describe("computeBudgetUtilizationPercent", () => {
  it("returns null for unlimited (null) budget", () => {
    expect(computeBudgetUtilizationPercent(null, 500)).toBeNull();
  });

  it("computes a rounded percentage", () => {
    expect(computeBudgetUtilizationPercent(1000, 500)).toBe(50);
    expect(computeBudgetUtilizationPercent(1000, 333)).toBe(33);
  });

  it("can exceed 100 when over budget", () => {
    expect(computeBudgetUtilizationPercent(1000, 1500)).toBe(150);
  });

  it("treats a zero budget as always 100 (no divide-by-zero)", () => {
    expect(computeBudgetUtilizationPercent(0, 0)).toBe(100);
    expect(computeBudgetUtilizationPercent(0, 500)).toBe(100);
  });
});

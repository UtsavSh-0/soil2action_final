import { describe, expect, it } from "vitest";
import { emptyForm, parseOptional, toRequest, validateStep } from "@/lib/soil-validation";

const filled = {
  ...emptyForm,
  farmerName: "Ram", state: "UP", district: "Agra", fieldName: "North", fieldSize: "2",
  currentCrop: "Wheat", ph: "7.1", n: "250", p: "20", k: "180", testDate: "2026-01-10",
};

describe("soil form rules", () => {
  it("blank optional measurement is null, not zero", () => {
    expect(parseOptional("")).toBeNull();
    const req = toRequest(filled, "en");
    expect(req.measurements.organic_carbon).toBeNull();
    expect(req.measurements.micronutrients.zinc).toBeNull();
  });
  it("rejects pH above 14", () => {
    expect(validateStep(1, { ...filled, ph: "14.5" }).ph?.key).toBe("v.range");
  });
  it("requires nitrogen", () => {
    expect(validateStep(1, { ...filled, n: "" }).n?.key).toBe("v.required");
  });
  it("rejects non-numeric input", () => {
    expect(validateStep(1, { ...filled, k: "abc" }).k?.key).toBe("v.number");
  });
  it("rejects zero field size", () => {
    expect(validateStep(0, { ...filled, fieldSize: "0" }).fieldSize?.key).toBe("v.positive");
  });
  it("rejects future test date", () => {
    expect(validateStep(1, filled, new Date("2026-01-01")).testDate?.key).toBe("v.futureDate");
  });
});

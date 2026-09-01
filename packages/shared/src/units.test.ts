import { describe, expect, it } from "vitest";
import {
  cmToFeetInches,
  defaultUnitForLocale,
  formatHeight,
  formatTotalVolume,
  formatVolume,
  formatWeightValue,
  kgToLbs,
  lbsToKg,
  parseAmount,
  parseWeightInput,
  weightInputValue,
} from "./units";

describe("kg <-> lbs", () => {
  it("round-trips 185 lbs exactly", () => {
    expect(kgToLbs(lbsToKg(185))).toBeCloseTo(185, 10);
  });
});

describe("formatWeightValue", () => {
  it("shows the stored kg value untouched", () => {
    expect(formatWeightValue(82.55, "kg")).toBe("82,55");
  });

  it("rounds lbs to one decimal", () => {
    expect(formatWeightValue(lbsToKg(181.94), "lbs")).toBe("181,9");
  });
});

// sv-SE använder tunt hårt mellanslag som tusentalsavgränsare (  /
//   beroende på ICU-version). Normalisera till vanligt blanksteg i
// jämförelserna.
const norm = (s: string) => s.replace(/[\u00a0\u202f]/g, " ");

describe("formatVolume", () => {
  it("rounds to whole units in both", () => {
    expect(norm(formatVolume(12480.4, "kg"))).toBe("12 480 kg");
    expect(norm(formatVolume(lbsToKg(999.6), "lbs"))).toBe("1 000 lbs");
  });
});

describe("formatTotalVolume", () => {
  it("switches to ton at 10 000 kg", () => {
    expect(norm(formatTotalVolume(9999, "kg"))).toBe("9 999 kg");
    expect(norm(formatTotalVolume(10000, "kg"))).toBe("10 ton");
  });

  it("switches to k lbs at 20 000 lbs", () => {
    const justUnder = lbsToKg(19999);
    const justOver = lbsToKg(20001);
    expect(norm(formatTotalVolume(justUnder, "lbs"))).toBe("19 999 lbs");
    expect(norm(formatTotalVolume(justOver, "lbs"))).toBe("20k lbs");
  });
});

describe("parseAmount", () => {
  it("rejects empty, parses comma, rejects negative", () => {
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("82,5")).toBe(82.5);
    expect(parseAmount("-3")).toBeNull();
  });
});

describe("parseWeightInput", () => {
  it("converts lbs text to kg", () => {
    expect(parseWeightInput("185", "lbs")).toBeCloseTo(lbsToKg(185), 10);
  });

  it("returns null for empty", () => {
    expect(parseWeightInput("", "lbs")).toBeNull();
    expect(parseWeightInput("", "kg")).toBeNull();
  });

  it("round-trips through weightInputValue in lbs", () => {
    const kg = parseWeightInput("185", "lbs")!;
    const shown = weightInputValue(kg, "lbs");
    const again = parseWeightInput(shown, "lbs")!;
    expect(weightInputValue(again, "lbs")).toBe(shown);
  });
});

describe("defaultUnitForLocale", () => {
  it("US -> lbs", () => {
    expect(defaultUnitForLocale({ regionCode: "US" })).toBe("lbs");
    expect(defaultUnitForLocale({ regionCode: "us" })).toBe("lbs");
  });

  it("SE / GB / null -> kg", () => {
    expect(defaultUnitForLocale({ regionCode: "SE" })).toBe("kg");
    expect(defaultUnitForLocale({ regionCode: "GB" })).toBe("kg");
    expect(defaultUnitForLocale(null)).toBe("kg");
  });

  it("measurementSystem us -> lbs", () => {
    expect(defaultUnitForLocale({ measurementSystem: "us" })).toBe("lbs");
  });
});

describe("height", () => {
  it("180 cm -> 5'11\"", () => {
    expect(formatHeight(180, "lbs")).toBe("5'11\"");
  });

  it("182,9 cm rounds to 6'0\" not 5'12\"", () => {
    expect(cmToFeetInches(182.9)).toEqual({ feet: 6, inches: 0 });
    expect(formatHeight(182.9, "lbs")).toBe("6'0\"");
  });

  it("handles the bounds 50 and 260", () => {
    expect(formatHeight(50, "lbs")).toBe("1'8\"");
    expect(formatHeight(260, "lbs")).toBe("8'6\"");
  });

  it("kg mode shows cm", () => {
    expect(formatHeight(180, "kg")).toBe("180 cm");
  });
});

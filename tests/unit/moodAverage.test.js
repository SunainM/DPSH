"use strict";
const { averageMoods } = require("../../src/common/moodAverage");

describe("averageMoods", () => {
  test("returns null for an empty array", () => {
    expect(averageMoods([])).toBeNull();
  });

  test("returns null when all entries are invalid", () => {
    expect(averageMoods([
      { temp_c: null,      temp_k: 3000, luminosity: 50  },
      { temp_c: undefined, temp_k: null, luminosity: null },
    ])).toBeNull();
  });

  test("single valid entry is returned as-is (with rounding)", () => {
    const result = averageMoods([{ temp_c: 22.0, temp_k: 3000, luminosity: 60 }]);
    expect(result).toEqual({ temp_c: 22.0, temp_k: 3000, luminosity: 60 });
    expect(typeof result.temp_c).toBe("number");
  });

  test("averages two entries correctly", () => {
    const result = averageMoods([
      { temp_c: 20.0, temp_k: 3000, luminosity: 40 },
      { temp_c: 24.0, temp_k: 5000, luminosity: 80 },
    ]);
    expect(result).toEqual({ temp_c: 22.0, temp_k: 4000, luminosity: 60 });
  });

  test("temp_c is rounded to 1 decimal place", () => {
    const result = averageMoods([
      { temp_c: 20.15, temp_k: 3000, luminosity: 50 },
      { temp_c: 20.25, temp_k: 3000, luminosity: 50 },
    ]);
    expect(result.temp_c).toBe(20.2);
  });

  test("temp_k and luminosity are integers", () => {
    const result = averageMoods([
      { temp_c: 21.0, temp_k: 3001, luminosity: 51 },
      { temp_c: 21.0, temp_k: 3002, luminosity: 52 },
    ]);
    expect(Number.isInteger(result.temp_k)).toBe(true);
    expect(Number.isInteger(result.luminosity)).toBe(true);
  });

  test("skips invalid entries and averages only valid ones", () => {
    const result = averageMoods([
      { temp_c: null, temp_k: 9999, luminosity: 9999 }, // invalid — skipped
      { temp_c: 20.0, temp_k: 3000, luminosity: 50 },   // valid
    ]);
    expect(result).toEqual({ temp_c: 20.0, temp_k: 3000, luminosity: 50 });
  });

  test("coerces numeric strings to numbers", () => {
    const result = averageMoods([{ temp_c: "22.5", temp_k: "295", luminosity: "500" }]);
    expect(result).toEqual({ temp_c: 22.5, temp_k: 295, luminosity: 500 });
  });
});

"use strict";
const { checkRequiredEnv } = require("../../src/common/envCheck");

describe("checkRequiredEnv", () => {
  test("returns ok:true when all vars are present", () => {
    const env = { MONGO_URL: "mongodb://x", BROKER_URL: "mqtt://x" };
    expect(checkRequiredEnv(["MONGO_URL", "BROKER_URL"], env)).toEqual({ ok: true, missing: [] });
  });

  test("reports a single missing var", () => {
    const env = { BROKER_URL: "mqtt://x" };
    const result = checkRequiredEnv(["MONGO_URL", "BROKER_URL"], env);
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(["MONGO_URL"]);
  });

  test("reports multiple missing vars", () => {
    const result = checkRequiredEnv(["A", "B", "C"], {});
    expect(result.ok).toBe(false);
    expect(result.missing).toHaveLength(3);
    expect(result.missing).toContain("B");
  });

  test("treats an empty-string value as missing", () => {
    const env = { MONGO_URL: "" };
    const result = checkRequiredEnv(["MONGO_URL"], env);
    expect(result.ok).toBe(false);
    expect(result.missing).toContain("MONGO_URL");
  });
});

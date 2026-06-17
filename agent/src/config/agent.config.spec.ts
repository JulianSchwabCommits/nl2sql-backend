import { requireInt, requireStr } from "./agent.config";

describe("agent.config", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe("requireInt", () => {
    it("returns parsed integer for valid env var", () => {
      process.env.TEST_INT = "42";
      expect(requireInt("TEST_INT")).toBe(42);
    });

    it("throws for missing env var", () => {
      delete process.env.TEST_INT;
      expect(() => requireInt("TEST_INT")).toThrow(
        "Missing required environment variable: TEST_INT",
      );
    });

    it("throws for empty string", () => {
      process.env.TEST_INT = "";
      expect(() => requireInt("TEST_INT")).toThrow(
        "Missing required environment variable: TEST_INT",
      );
    });

    it("throws for non-numeric value", () => {
      process.env.TEST_INT = "abc";
      expect(() => requireInt("TEST_INT")).toThrow(
        'expected a positive number, got "abc"',
      );
    });

    it("throws for negative number", () => {
      process.env.TEST_INT = "-5";
      expect(() => requireInt("TEST_INT")).toThrow(
        'expected a positive number, got "-5"',
      );
    });

    it("throws for zero", () => {
      process.env.TEST_INT = "0";
      expect(() => requireInt("TEST_INT")).toThrow(
        'expected a positive number, got "0"',
      );
    });

    it("throws for Infinity", () => {
      process.env.TEST_INT = "Infinity";
      expect(() => requireInt("TEST_INT")).toThrow(
        "expected a positive number",
      );
    });

    it("throws for NaN", () => {
      process.env.TEST_INT = "NaN";
      expect(() => requireInt("TEST_INT")).toThrow(
        "expected a positive number",
      );
    });
  });

  describe("requireStr", () => {
    it("returns string for valid env var", () => {
      process.env.TEST_STR = "hello";
      expect(requireStr("TEST_STR")).toBe("hello");
    });

    it("throws for missing env var", () => {
      delete process.env.TEST_STR;
      expect(() => requireStr("TEST_STR")).toThrow(
        "Missing required environment variable: TEST_STR",
      );
    });

    it("throws for empty string", () => {
      process.env.TEST_STR = "";
      expect(() => requireStr("TEST_STR")).toThrow(
        "Missing required environment variable: TEST_STR",
      );
    });
  });
});

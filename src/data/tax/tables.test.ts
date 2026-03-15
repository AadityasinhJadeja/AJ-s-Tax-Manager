import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { getCalculationTables, getStateOptionsForYear, getTaxYearMetadata } from "./tables";

describe("tax table adapter", () => {
  it("exposes only the focused hourly jurisdictions for 2026", () => {
    const options = getStateOptionsForYear(2026);
    expect(options.map((option) => option.code)).toEqual([
      "AZ",
      "CA",
      "NC",
      "TX",
      "NY",
      "PA",
      "IL",
      "WA",
      "GA",
      "FL"
    ]);
  });

  it("applies alias labels for Philadelphia and Atlanta", () => {
    const options = getStateOptionsForYear(2026);
    const labelsByCode = Object.fromEntries(options.map((option) => [option.code, option.label]));
    expect(labelsByCode.PA).toBe("Philadelphia");
    expect(labelsByCode.GA).toBe("Atlanta");
  });

  it("loads calculation tables for every focused state code", () => {
    const stateCodes = getStateOptionsForYear(2026).map((option) => option.code);
    for (const stateCode of stateCodes) {
      const tables = getCalculationTables(2026, stateCode);
      expect(tables).not.toBeNull();
      expect(tables?.state.stateCode).toBe(stateCode);
    }
  });

  it("returns null for unconfigured states", () => {
    expect(getCalculationTables(2026, "CO")).toBeNull();
  });

  it("keeps on-disk state files aligned with configured state options", () => {
    const statesDirectory = fileURLToPath(new URL("../../../data/tax/2026/states", import.meta.url));
    const configuredCodes = getStateOptionsForYear(2026).map((option) => option.code).sort();
    const stateFiles = readdirSync(statesDirectory)
      .filter((fileName) => fileName.endsWith(".json"))
      .map((fileName) => fileName.replace(".json", ""))
      .sort();

    expect(stateFiles).toEqual(configuredCodes);
  });

  it("includes source metadata for federal and every configured state", () => {
    const metadata = getTaxYearMetadata(2026);
    const scopes = new Set(metadata.sources.map((source) => source.scope));

    expect(scopes.has("federal")).toBe(true);
    for (const stateCode of getStateOptionsForYear(2026).map((option) => option.code)) {
      expect(scopes.has(`state:${stateCode}`)).toBe(true);
    }
  });
});

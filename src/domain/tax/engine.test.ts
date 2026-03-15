import { describe, expect, it } from "vitest";
import { computeNet, DEFAULT_FICA_CONFIG } from "./engine";
import type { CalculationInput, CalculationTables, StateTaxTable } from "./types";

const federalTable: CalculationTables["federal"] = {
  standardDeductionByStatus: {
    single: 10000,
    married_joint: 20000
  },
  bracketsByStatus: {
    single: [
      { upTo: 10000, rate: 0.1 },
      { upTo: 50000, rate: 0.2 },
      { upTo: null, rate: 0.3 }
    ],
    married_joint: [
      { upTo: 20000, rate: 0.1 },
      { upTo: 80000, rate: 0.2 },
      { upTo: null, rate: 0.3 }
    ]
  }
};

const txTable: StateTaxTable = {
  stateCode: "TX",
  taxType: "none"
};

const coTable: StateTaxTable = {
  stateCode: "CO",
  taxType: "flat",
  flatRate: 0.05
};

const caTable: StateTaxTable = {
  stateCode: "CA",
  taxType: "progressive",
  standardDeductionByStatus: { single: 5000 },
  bracketsByStatus: {
    single: [
      { upTo: 20000, rate: 0.02 },
      { upTo: 60000, rate: 0.05 },
      { upTo: null, rate: 0.08 }
    ]
  }
};

describe("computeNet", () => {
  it("handles no-income-tax state with standard FICA", () => {
    const input: CalculationInput = {
      mode: "salary",
      annualSalary: 100000,
      stateCode: "TX",
      taxYear: 2026,
      filingStatus: "single",
      ficaMode: "standard",
      preTaxDeductionsAnnual: 0
    };
    const result = computeNet(input, { federal: federalTable, state: txTable }, DEFAULT_FICA_CONFIG);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.summary.federalTax).toBe(21000);
    expect(result.value.summary.stateTax).toBe(0);
    expect(result.value.summary.ficaTax).toBe(7650);
    expect(result.value.summary.netAnnual).toBe(71350);
    expect(result.value.summary.netMonthly).toBe(5945.83);
  });

  it("handles flat-tax state with hourly mode and FICA exemption", () => {
    const input: CalculationInput = {
      mode: "hourly",
      hourlyRate: 50,
      hoursPerWeek: 20,
      weeksPerYear: 50,
      stateCode: "CO",
      taxYear: 2026,
      filingStatus: "single",
      ficaMode: "exempt",
      preTaxDeductionsAnnual: 2000
    };
    const result = computeNet(input, { federal: federalTable, state: coTable }, DEFAULT_FICA_CONFIG);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.summary.grossAnnualIncome).toBe(50000);
    expect(result.value.summary.federalTax).toBe(6730.77);
    expect(result.value.summary.stateTax).toBe(2403.85);
    expect(result.value.summary.ficaTax).toBe(0);
    expect(result.value.summary.netAnnual).toBe(40865.38);
    expect(result.value.summary.effectiveNetHourly).toBe(40.87);
    expect(result.value.summary.grossMonthly).toBe(4166.67);
    expect(result.value.summary.grossBiweekly).toBe(2000);
  });

  it("supports hourly mode with explicit total hours for partial-week contracts", () => {
    const input: CalculationInput = {
      mode: "hourly",
      hourlyRate: 50,
      hoursPerWeek: 20,
      weeksPerYear: 1,
      totalHours: 196,
      stateCode: "CO",
      taxYear: 2026,
      filingStatus: "single",
      ficaMode: "exempt",
      preTaxDeductionsAnnual: 0
    };
    const result = computeNet(input, { federal: federalTable, state: coTable }, DEFAULT_FICA_CONFIG);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.summary.grossAnnualIncome).toBe(9800);
    expect(result.value.summary.federalTax).toBe(1394.62);
    expect(result.value.summary.effectiveNetHourly).toBe(40.38);
  });

  it("updates gross monthly when hourly total income changes", () => {
    const baseInput: CalculationInput = {
      mode: "hourly",
      hourlyRate: 40,
      hoursPerWeek: 20,
      weeksPerYear: 10,
      stateCode: "TX",
      taxYear: 2026,
      filingStatus: "single",
      ficaMode: "standard",
      preTaxDeductionsAnnual: 0
    };
    const low = computeNet(baseInput, { federal: federalTable, state: txTable }, DEFAULT_FICA_CONFIG);
    const high = computeNet(
      { ...baseInput, weeksPerYear: 20 },
      { federal: federalTable, state: txTable },
      DEFAULT_FICA_CONFIG
    );

    expect(low.ok).toBe(true);
    expect(high.ok).toBe(true);
    if (!low.ok || !high.ok) {
      return;
    }

    expect(low.value.summary.grossMonthly).toBeLessThan(high.value.summary.grossMonthly);
  });

  it("keeps one-week hourly contracts anchored to total values for bi-weekly metrics", () => {
    const oneWeek: CalculationInput = {
      mode: "hourly",
      hourlyRate: 35,
      hoursPerWeek: 20,
      weeksPerYear: 1,
      stateCode: "CA",
      taxYear: 2026,
      filingStatus: "single",
      ficaMode: "exempt",
      preTaxDeductionsAnnual: 0
    };
    const result = computeNet(oneWeek, { federal: federalTable, state: caTable }, DEFAULT_FICA_CONFIG);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.summary.grossAnnualIncome).toBe(700);
    expect(result.value.summary.grossBiweekly).toBe(700);
    expect(result.value.summary.netBiweekly).toBe(result.value.summary.netAnnual);
  });

  it("uses true two-week equivalents for odd-week hourly contracts", () => {
    const input: CalculationInput = {
      mode: "hourly",
      hourlyRate: 35,
      hoursPerWeek: 20,
      weeksPerYear: 9,
      stateCode: "TX",
      taxYear: 2026,
      filingStatus: "single",
      ficaMode: "exempt",
      preTaxDeductionsAnnual: 0
    };
    const result = computeNet(input, { federal: federalTable, state: txTable }, DEFAULT_FICA_CONFIG);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.summary.grossAnnualIncome).toBe(6300);
    expect(result.value.summary.grossBiweekly).toBe(1400);
    expect(result.value.summary.totalBiweeklyTax).toBe(164.62);
    expect(result.value.summary.netBiweekly).toBe(1235.38);
  });

  it("uses filing status from input (not hard-coded) for federal tax", () => {
    const single = computeNet(
      {
        mode: "salary",
        annualSalary: 100000,
        stateCode: "TX",
        taxYear: 2026,
        filingStatus: "single",
        ficaMode: "standard",
        preTaxDeductionsAnnual: 0
      },
      { federal: federalTable, state: txTable },
      DEFAULT_FICA_CONFIG
    );
    const marriedJoint = computeNet(
      {
        mode: "salary",
        annualSalary: 100000,
        stateCode: "TX",
        taxYear: 2026,
        filingStatus: "married_joint",
        ficaMode: "standard",
        preTaxDeductionsAnnual: 0
      },
      { federal: federalTable, state: txTable },
      DEFAULT_FICA_CONFIG
    );

    expect(single.ok).toBe(true);
    expect(marriedJoint.ok).toBe(true);
    if (!single.ok || !marriedJoint.ok) {
      return;
    }

    expect(single.value.summary.federalTax).not.toBe(marriedJoint.value.summary.federalTax);
  });

  it("handles progressive-tax state with deductions and standard FICA", () => {
    const input: CalculationInput = {
      mode: "salary",
      annualSalary: 120000,
      stateCode: "CA",
      taxYear: 2026,
      filingStatus: "single",
      ficaMode: "standard",
      preTaxDeductionsAnnual: 10000
    };
    const result = computeNet(input, { federal: federalTable, state: caTable }, DEFAULT_FICA_CONFIG);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.summary.federalTax).toBe(24000);
    expect(result.value.summary.stateTax).toBe(6000);
    expect(result.value.summary.ficaTax).toBe(9180);
    expect(result.value.summary.netAnnual).toBe(80820);
  });

  it("returns error on missing tables", () => {
    const input: CalculationInput = {
      mode: "salary",
      annualSalary: 90000,
      stateCode: "TX",
      taxYear: 2026,
      filingStatus: "single",
      ficaMode: "standard",
      preTaxDeductionsAnnual: 0
    };
    const result = computeNet(input, null, DEFAULT_FICA_CONFIG);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.errors.length).toBeGreaterThan(0);

    expect(result.errors[0]!.code).toBe("MISSING_TABLE");
  });

  it("returns validation errors for invalid ranges", () => {
    const input: CalculationInput = {
      mode: "hourly",
      hourlyRate: -10,
      hoursPerWeek: 20,
      weeksPerYear: 50,
      stateCode: "TX",
      taxYear: 2026,
      filingStatus: "single",
      ficaMode: "standard",
      preTaxDeductionsAnnual: 0
    };
    const result = computeNet(input, { federal: federalTable, state: txTable }, DEFAULT_FICA_CONFIG);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.errors.some((e) => e.code === "INVALID_INPUT_RANGE")).toBe(true);
  });

  it("returns incomplete state rule error for unsupported filing status in state table", () => {
    const input: CalculationInput = {
      mode: "salary",
      annualSalary: 120000,
      stateCode: "CA",
      taxYear: 2026,
      filingStatus: "married_joint",
      ficaMode: "standard",
      preTaxDeductionsAnnual: 0
    };
    const result = computeNet(input, { federal: federalTable, state: caTable }, DEFAULT_FICA_CONFIG);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.errors.length).toBeGreaterThan(0);

    expect(result.errors[0]!.code).toBe("INCOMPLETE_STATE_RULE");
  });
});

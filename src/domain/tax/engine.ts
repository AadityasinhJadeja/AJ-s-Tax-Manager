import type { DomainError, DomainResult } from "./errors";
import type {
  CalculationInput,
  CalculationSummary,
  CalculationTables,
  FederalTaxTable,
  FicaConfig,
  ProgressiveBracket,
  StateTaxTable,
  TaxLine
} from "./types";

export const DEFAULT_FICA_CONFIG: FicaConfig = {
  socialSecurityRate: 0.062,
  medicareRate: 0.0145,
  socialSecurityWageBase: 176100
};

export interface CalculationAssumptions {
  taxYear: number;
  filingStatus: CalculationInput["filingStatus"];
  stateCode: string;
  payFrequency: CalculationInput["payFrequency"];
  ficaMode: CalculationInput["ficaMode"];
  tableVersion?: string;
}

export interface CalculationOutput {
  summary: CalculationSummary;
  lines: TaxLine[];
  assumptions: CalculationAssumptions;
}

function roundToCents(value: number): number {
  return Math.round(value * 100) / 100;
}

function clampNonNegative(value: number): number {
  return value < 0 ? 0 : value;
}

function annualHoursForEffectiveRate(input: CalculationInput): number {
  if (input.mode === "hourly") {
    if (input.totalHours !== undefined) {
      return input.totalHours;
    }
    return input.hoursPerWeek * input.weeksPerYear;
  }
  return input.annualHoursForEffectiveRate ?? 2080;
}

function hourlyContractHours(input: CalculationInput): number {
  if (input.mode !== "hourly") {
    return 0;
  }
  if (input.totalHours !== undefined) {
    return input.totalHours;
  }
  return input.hoursPerWeek * input.weeksPerYear;
}

function hourlyContractWeeks(input: CalculationInput): number {
  if (input.mode !== "hourly") {
    return 0;
  }
  if (input.hoursPerWeek > 0) {
    return hourlyContractHours(input) / input.hoursPerWeek;
  }
  return input.weeksPerYear;
}

function prorateTaxLine(line: TaxLine, factor: number): TaxLine {
  return {
    ...line,
    amount: roundToCents(line.amount * factor),
    taxableIncome: roundToCents(line.taxableIncome * factor)
  };
}

function progressiveTax(income: number, brackets: ProgressiveBracket[]): number {
  let taxed = 0;
  let lowerBound = 0;
  let remaining = income;

  for (const bracket of brackets) {
    const upperBound = bracket.upTo ?? Number.POSITIVE_INFINITY;
    const bracketWidth = upperBound - lowerBound;
    if (bracketWidth <= 0 || remaining <= 0) {
      lowerBound = upperBound;
      continue;
    }
    const amountInBracket = Math.min(remaining, bracketWidth);
    taxed += amountInBracket * bracket.rate;
    remaining -= amountInBracket;
    lowerBound = upperBound;
  }

  return roundToCents(clampNonNegative(taxed));
}

function validateInput(input: CalculationInput): DomainError[] {
  const errors: DomainError[] = [];
  if (input.preTaxDeductionsAnnual < 0) {
    errors.push({
      code: "INVALID_INPUT_RANGE",
      field: "preTaxDeductionsAnnual",
      message: "Pre-tax deductions cannot be negative."
    });
  }

  if (input.mode === "hourly") {
    if (input.hourlyRate < 0) {
      errors.push({
        code: "INVALID_INPUT_RANGE",
        field: "hourlyRate",
        message: "Hourly rate cannot be negative."
      });
    }
    if (input.hoursPerWeek < 0) {
      errors.push({
        code: "INVALID_INPUT_RANGE",
        field: "hoursPerWeek",
        message: "Hours per week cannot be negative."
      });
    }
    if (input.totalHours !== undefined) {
      if (input.totalHours < 0) {
        errors.push({
          code: "INVALID_INPUT_RANGE",
          field: "totalHours",
          message: "Total hours cannot be negative."
        });
      }
    } else if (input.weeksPerYear <= 0) {
      errors.push({
        code: "INVALID_INPUT_RANGE",
        field: "weeksPerYear",
        message: "Total weeks must be greater than zero."
      });
    }
    if (input.paychecksPerContract !== undefined && input.paychecksPerContract <= 0) {
      errors.push({
        code: "INVALID_INPUT_RANGE",
        field: "paychecksPerContract",
        message: "Bi-weekly paychecks must be greater than zero."
      });
    }
  } else if (input.annualSalary < 0) {
    errors.push({
      code: "INVALID_INPUT_RANGE",
      field: "annualSalary",
      message: "Annual salary cannot be negative."
    });
  }

  return errors;
}

export function annualizeIncome(input: CalculationInput): number {
  if (input.mode === "hourly") {
    if (input.totalHours !== undefined) {
      return roundToCents(input.hourlyRate * input.totalHours);
    }
    return roundToCents(input.hourlyRate * input.hoursPerWeek * input.weeksPerYear);
  }
  return roundToCents(input.annualSalary);
}

function federalBracketsForStatus(
  table: FederalTaxTable,
  filingStatus: CalculationInput["filingStatus"]
): ProgressiveBracket[] | null {
  return table.bracketsByStatus[filingStatus] ?? null;
}

function stateBracketsForStatus(
  table: StateTaxTable,
  filingStatus: CalculationInput["filingStatus"]
): ProgressiveBracket[] | null {
  if (table.taxType !== "progressive") {
    return null;
  }
  return table.bracketsByStatus[filingStatus] ?? null;
}

export function computeFederalTax(
  taxableIncome: number,
  table: FederalTaxTable,
  filingStatus: CalculationInput["filingStatus"]
): TaxLine | null {
  const brackets = federalBracketsForStatus(table, filingStatus);
  if (!brackets) {
    return null;
  }
  return {
    name: "federal",
    taxableIncome: clampNonNegative(taxableIncome),
    amount: progressiveTax(clampNonNegative(taxableIncome), brackets)
  };
}

export function computeStateTax(
  taxableIncome: number,
  table: StateTaxTable,
  filingStatus: CalculationInput["filingStatus"]
): TaxLine | null {
  const income = clampNonNegative(taxableIncome);
  if (table.taxType === "none") {
    return { name: "state", taxableIncome: income, amount: 0 };
  }
  if (table.taxType === "flat") {
    return {
      name: "state",
      taxableIncome: income,
      amount: roundToCents(income * table.flatRate)
    };
  }
  const brackets = stateBracketsForStatus(table, filingStatus);
  if (!brackets) {
    return null;
  }
  return {
    name: "state",
    taxableIncome: income,
    amount: progressiveTax(income, brackets)
  };
}

export function computeFica(
  grossAnnualIncome: number,
  ficaMode: CalculationInput["ficaMode"],
  config: FicaConfig
): TaxLine {
  if (ficaMode === "exempt") {
    return { name: "fica", taxableIncome: grossAnnualIncome, amount: 0 };
  }
  const socialSecurityIncome = Math.min(grossAnnualIncome, config.socialSecurityWageBase);
  const socialSecurityTax = socialSecurityIncome * config.socialSecurityRate;
  const medicareTax = grossAnnualIncome * config.medicareRate;
  return {
    name: "fica",
    taxableIncome: grossAnnualIncome,
    amount: roundToCents(clampNonNegative(socialSecurityTax + medicareTax))
  };
}

export function computeNet(
  input: CalculationInput,
  tables: CalculationTables | null,
  ficaConfig: FicaConfig = DEFAULT_FICA_CONFIG,
  tableVersion?: string
): DomainResult<CalculationOutput> {
  const validationErrors = validateInput(input);
  if (validationErrors.length > 0) {
    return { ok: false, errors: validationErrors };
  }
  if (!tables) {
    return {
      ok: false,
      errors: [{ code: "MISSING_TABLE", message: "Tax tables are required." }]
    };
  }

  const grossAnnualIncome = annualizeIncome(input);
  const contractWeeks = input.mode === "hourly" ? hourlyContractWeeks(input) : 52;
  const annualizedGrossForTax =
    input.mode === "hourly" && contractWeeks > 0
      ? roundToCents((grossAnnualIncome * 52) / contractWeeks)
      : grossAnnualIncome;
  const taxProrationFactor =
    input.mode === "hourly" && contractWeeks > 0 ? contractWeeks / 52 : 1;

  const taxableBase = clampNonNegative(annualizedGrossForTax - input.preTaxDeductionsAnnual);
  const federalDeduction = tables.federal.standardDeductionByStatus[input.filingStatus];
  if (federalDeduction === undefined) {
    return {
      ok: false,
      errors: [
        {
          code: "UNSUPPORTED_FILING_STATUS",
          field: "filingStatus",
          message: `Unsupported filing status for federal table: ${input.filingStatus}`
        }
      ]
    };
  }

  const taxableFederalIncome = clampNonNegative(taxableBase - federalDeduction);
  const federalAnnual = computeFederalTax(taxableFederalIncome, tables.federal, input.filingStatus);
  if (!federalAnnual) {
    return {
      ok: false,
      errors: [
        {
          code: "UNSUPPORTED_FILING_STATUS",
          field: "filingStatus",
          message: `Federal brackets missing for filing status: ${input.filingStatus}`
        }
      ]
    };
  }

  const stateDeduction = tables.state.standardDeductionByStatus?.[input.filingStatus] ?? 0;
  const taxableStateIncome = clampNonNegative(taxableBase - stateDeduction);
  const stateAnnual = computeStateTax(taxableStateIncome, tables.state, input.filingStatus);
  if (!stateAnnual) {
    return {
      ok: false,
      errors: [
        {
          code: "INCOMPLETE_STATE_RULE",
          field: "filingStatus",
          message: `State table incomplete for filing status: ${input.filingStatus}`
        }
      ]
    };
  }

  const ficaAnnual = computeFica(annualizedGrossForTax, input.ficaMode, ficaConfig);
  const federal =
    input.mode === "hourly" ? prorateTaxLine(federalAnnual, taxProrationFactor) : federalAnnual;
  const state =
    input.mode === "hourly" ? prorateTaxLine(stateAnnual, taxProrationFactor) : stateAnnual;
  const fica =
    input.mode === "hourly" ? prorateTaxLine(ficaAnnual, taxProrationFactor) : ficaAnnual;
  const totalTax = roundToCents(federal.amount + state.amount + fica.amount);
  const netAnnual = roundToCents(grossAnnualIncome - totalTax);
  const annualHours = annualHoursForEffectiveRate(input);
  const effectiveNetHourly = annualHours > 0 ? roundToCents(netAnnual / annualHours) : 0;
  // Hourly bi-weekly metrics are "2-week equivalents", not paycheck-count averages.
  const biweeklyDivisor =
    input.mode === "hourly" ? Math.max(1, contractWeeks / 2) : 26;
  const grossBiweekly = roundToCents(grossAnnualIncome / biweeklyDivisor);
  const grossMonthly = roundToCents(grossAnnualIncome / 12);
  const netBiweekly = roundToCents(netAnnual / biweeklyDivisor);
  const netMonthly = roundToCents(netAnnual / 12);
  const netSemimonthly = roundToCents(netAnnual / 24);
  const totalBiweeklyTax = roundToCents(totalTax / biweeklyDivisor);
  const assumptions: CalculationAssumptions = {
    taxYear: input.taxYear,
    filingStatus: input.filingStatus,
    stateCode: input.stateCode,
    payFrequency: input.payFrequency,
    ficaMode: input.ficaMode
  };
  if (tableVersion !== undefined) {
    assumptions.tableVersion = tableVersion;
  }

  return {
    ok: true,
    value: {
      summary: {
        grossAnnualIncome,
        grossMonthly,
        grossBiweekly,
        taxableFederalIncome: federal.taxableIncome,
        taxableStateIncome: state.taxableIncome,
        federalTax: federal.amount,
        stateTax: state.amount,
        ficaTax: fica.amount,
        totalTax,
        totalBiweeklyTax,
        netAnnual,
        netMonthly,
        netBiweekly,
        netSemimonthly,
        effectiveTaxRate:
          grossAnnualIncome > 0 ? roundToCents(totalTax / grossAnnualIncome) : 0,
        effectiveNetHourly
      },
      lines: [federal, state, fica],
      assumptions
    }
  };
}

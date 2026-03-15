export type FilingStatus = "single" | "married_joint";
export type PayFrequency = "monthly" | "biweekly" | "semimonthly";
export type FicaMode = "standard" | "exempt";

export interface ProgressiveBracket {
  upTo: number | null;
  rate: number;
}

export interface FederalTaxTable {
  standardDeductionByStatus: Record<FilingStatus, number>;
  bracketsByStatus: Record<FilingStatus, ProgressiveBracket[]>;
}

export type StateTaxType = "none" | "flat" | "progressive";

interface StateTableBase {
  stateCode: string;
  taxType: StateTaxType;
  standardDeductionByStatus?: Partial<Record<FilingStatus, number>>;
}

export interface StateTaxNoneTable extends StateTableBase {
  taxType: "none";
}

export interface StateTaxFlatTable extends StateTableBase {
  taxType: "flat";
  flatRate: number;
}

export interface StateTaxProgressiveTable extends StateTableBase {
  taxType: "progressive";
  bracketsByStatus: Partial<Record<FilingStatus, ProgressiveBracket[]>>;
}

export type StateTaxTable =
  | StateTaxNoneTable
  | StateTaxFlatTable
  | StateTaxProgressiveTable;

export interface FicaConfig {
  socialSecurityRate: number;
  medicareRate: number;
  socialSecurityWageBase: number;
}

interface CommonCalculationInput {
  stateCode: string;
  taxYear: number;
  filingStatus: FilingStatus;
  ficaMode: FicaMode;
  preTaxDeductionsAnnual: number;
  payFrequency?: PayFrequency;
}

export interface HourlyCalculationInput extends CommonCalculationInput {
  mode: "hourly";
  hourlyRate: number;
  hoursPerWeek: number;
  weeksPerYear: number;
  totalHours?: number;
  paychecksPerContract?: number;
}

export interface SalaryCalculationInput extends CommonCalculationInput {
  mode: "salary";
  annualSalary: number;
  annualHoursForEffectiveRate?: number;
}

export type CalculationInput = HourlyCalculationInput | SalaryCalculationInput;

export interface TaxLine {
  name: "federal" | "state" | "fica";
  amount: number;
  taxableIncome: number;
}

export interface CalculationSummary {
  grossAnnualIncome: number;
  grossMonthly: number;
  grossBiweekly: number;
  taxableFederalIncome: number;
  taxableStateIncome: number;
  federalTax: number;
  stateTax: number;
  ficaTax: number;
  totalTax: number;
  totalBiweeklyTax: number;
  netAnnual: number;
  netMonthly: number;
  netBiweekly: number;
  netSemimonthly: number;
  effectiveTaxRate: number;
  effectiveNetHourly: number;
}

export interface CalculationTables {
  federal: FederalTaxTable;
  state: StateTaxTable;
}

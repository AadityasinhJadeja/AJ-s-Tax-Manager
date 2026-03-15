import type { FicaMode, FilingStatus, PayFrequency } from "@/src/domain/tax/types";
import { createClientId, isObject, toFiniteNumber } from "@/src/state/persistence";

const STORAGE_KEY = "ajfm.saved-scenarios.v1";

export type ScenarioMode = "hourly" | "salary";
export type HourlyDurationMode = "weeks" | "date_range";

export interface ScenarioFormValues {
  mode: ScenarioMode;
  taxYear: number;
  stateCode: string;
  filingStatus: FilingStatus;
  ficaMode: FicaMode;
  payFrequency: PayFrequency;
  preTaxDeductionsAnnual: number;
  hourlyRate: number;
  hoursPerWeek: number;
  totalWeeks: number;
  hourlyDurationMode: HourlyDurationMode;
  startDate: string;
  endDate: string;
  partialWeekHours: number;
  annualSalary: number;
}

export interface SavedScenario {
  id: string;
  name: string;
  pinned: boolean;
  compare: boolean;
  createdAt: number;
  updatedAt: number;
  form: ScenarioFormValues;
}

function normalizeScenarioForm(value: unknown): ScenarioFormValues | null {
  if (!isObject(value)) {
    return null;
  }

  const mode = value.mode === "hourly" || value.mode === "salary" ? value.mode : null;
  const taxYear = typeof value.taxYear === "number" && Number.isFinite(value.taxYear)
    ? value.taxYear
    : null;
  const stateCode = typeof value.stateCode === "string" ? value.stateCode : null;

  if (mode === null || taxYear === null || stateCode === null) {
    return null;
  }

  const durationMode: HourlyDurationMode =
    value.hourlyDurationMode === "date_range" ? "date_range" : "weeks";
  const legacyWeeks =
    typeof value.weeksPerYear === "number" && Number.isFinite(value.weeksPerYear)
      ? value.weeksPerYear
      : null;

  return {
    mode,
    taxYear,
    stateCode,
    filingStatus: value.filingStatus === "married_joint" ? "married_joint" : "single",
    ficaMode: value.ficaMode === "standard" ? "standard" : "exempt",
    payFrequency:
      value.payFrequency === "monthly" ||
      value.payFrequency === "biweekly" ||
      value.payFrequency === "semimonthly"
        ? value.payFrequency
        : "biweekly",
    preTaxDeductionsAnnual: toFiniteNumber(value.preTaxDeductionsAnnual, 0),
    hourlyRate: toFiniteNumber(value.hourlyRate, 0),
    hoursPerWeek: toFiniteNumber(value.hoursPerWeek, 0),
    totalWeeks: toFiniteNumber(value.totalWeeks, legacyWeeks ?? 50),
    hourlyDurationMode: durationMode,
    startDate: typeof value.startDate === "string" ? value.startDate : "",
    endDate: typeof value.endDate === "string" ? value.endDate : "",
    partialWeekHours: toFiniteNumber(value.partialWeekHours, 0),
    annualSalary: toFiniteNumber(value.annualSalary, 0)
  };
}

function normalizeSavedScenario(value: unknown): SavedScenario | null {
  if (!isObject(value)) {
    return null;
  }

  const form = normalizeScenarioForm(value.form);
  if (
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    typeof value.pinned !== "boolean" ||
    typeof value.compare !== "boolean" ||
    typeof value.createdAt !== "number" ||
    typeof value.updatedAt !== "number" ||
    form === null
  ) {
    return null;
  }

  return {
    id: value.id,
    name: value.name,
    pinned: value.pinned,
    compare: value.compare,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    form
  };
}

export function loadScenarios(): SavedScenario[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map((item) => normalizeSavedScenario(item))
      .filter((scenario): scenario is SavedScenario => scenario !== null);
  } catch {
    return [];
  }
}

export function saveScenarios(scenarios: SavedScenario[]): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(scenarios));
}

export function createScenarioId(): string {
  return createClientId();
}

import { createClientId, isObject, toFiniteNumber } from "@/src/state/persistence";

const STORAGE_KEY = "ajfm.salary-scenarios.v1";

export interface SalaryScenarioFormValues {
  taxYear: number;
  stateCode: string;
  annualSalary: number;
  contribution401kPercent: number;
}

export interface SavedSalaryScenario {
  id: string;
  name: string;
  pinned: boolean;
  compare: boolean;
  createdAt: number;
  updatedAt: number;
  form: SalaryScenarioFormValues;
}

function normalizeForm(value: unknown): SalaryScenarioFormValues | null {
  if (!isObject(value)) {
    return null;
  }

  const taxYear = typeof value.taxYear === "number" && Number.isFinite(value.taxYear)
    ? value.taxYear
    : null;
  const stateCode = typeof value.stateCode === "string" ? value.stateCode : null;

  if (taxYear === null || stateCode === null) {
    return null;
  }

  return {
    taxYear,
    stateCode,
    annualSalary: toFiniteNumber(value.annualSalary, 0),
    contribution401kPercent: toFiniteNumber(value.contribution401kPercent, 0)
  };
}

function normalizeScenario(value: unknown): SavedSalaryScenario | null {
  if (!isObject(value)) {
    return null;
  }

  const form = normalizeForm(value.form);
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

export function loadSalaryScenarios(): SavedSalaryScenario[] {
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
      .map((item) => normalizeScenario(item))
      .filter((scenario): scenario is SavedSalaryScenario => scenario !== null);
  } catch {
    return [];
  }
}

export function saveSalaryScenarios(scenarios: SavedSalaryScenario[]): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(scenarios));
}

export function createSalaryScenarioId(): string {
  return createClientId();
}

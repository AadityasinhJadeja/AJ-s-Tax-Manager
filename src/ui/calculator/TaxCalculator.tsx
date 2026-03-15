"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { computeNet, DEFAULT_FICA_CONFIG } from "@/src/domain/tax/engine";
import type { CalculationInput } from "@/src/domain/tax/types";
import {
  AVAILABLE_TAX_YEARS,
  getCalculationTables,
  getTaxYearMetadata,
  getStateOptionsForYear,
  getTableVersion
} from "@/src/data/tax/tables";
import {
  createScenarioId,
  loadScenarios,
  saveScenarios,
  type SavedScenario,
  type HourlyDurationMode,
  type ScenarioFormValues
} from "@/src/state/scenarios/store";

type ComparisonSortMetric = "netMonthly" | "netAnnual" | "effectiveNetHourly" | "totalTax";
type StatusTone = "info" | "success" | "warning";
type WarningTone = "info" | "warning" | "caution";

const MAX_COMPARE_SCENARIOS = 4;
const STATUS_TIMEOUT_MS = 2600;
const MS_PER_DAY = 1000 * 60 * 60 * 24;

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2
});

const percentFormatter = new Intl.NumberFormat("en-US", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1
});

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit"
});

function parseNumber(value: string): number {
  const next = Number(value);
  return Number.isFinite(next) ? next : 0;
}

function marginalRateFromBrackets(
  taxableIncome: number,
  brackets: Array<{ upTo: number | null; rate: number }>
): number {
  if (brackets.length === 0) {
    return 0;
  }
  const income = Math.max(taxableIncome, 0);
  for (const bracket of brackets) {
    if (bracket.upTo === null || income <= bracket.upTo) {
      return bracket.rate;
    }
  }
  return brackets[brackets.length - 1]?.rate ?? 0;
}

function ratioOrZero(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    return 0;
  }
  return numerator / denominator;
}

function parseIsoDate(value: string): Date | null {
  if (!value) {
    return null;
  }
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
}

interface HourlyDurationDetails {
  mode: HourlyDurationMode;
  totalWeeks: number;
  totalHours: number;
  totalDays: number;
  fullWeeks: number;
  remainingDays: number;
  usesPartialWeekOverride: boolean;
  isDateRangeValid: boolean;
}

function resolveHourlyDuration(form: ScenarioFormValues): HourlyDurationDetails {
  const hoursPerWeek = Math.max(form.hoursPerWeek, 0);

  if (form.hourlyDurationMode === "weeks") {
    const totalWeeks = Math.max(form.totalWeeks, 0);
    return {
      mode: "weeks",
      totalWeeks,
      totalHours: totalWeeks * hoursPerWeek,
      totalDays: Math.max(0, Math.ceil(totalWeeks * 7)),
      fullWeeks: Math.floor(totalWeeks),
      remainingDays: 0,
      usesPartialWeekOverride: false,
      isDateRangeValid: true
    };
  }

  const startDate = parseIsoDate(form.startDate);
  const endDate = parseIsoDate(form.endDate);
  if (startDate === null || endDate === null || endDate.getTime() < startDate.getTime()) {
    const fallbackWeeks = Math.max(form.totalWeeks, 0);
    return {
      mode: "date_range",
      totalWeeks: fallbackWeeks,
      totalHours: fallbackWeeks * hoursPerWeek,
      totalDays: Math.max(0, Math.ceil(fallbackWeeks * 7)),
      fullWeeks: Math.floor(fallbackWeeks),
      remainingDays: 0,
      usesPartialWeekOverride: false,
      isDateRangeValid: false
    };
  }

  const daySpan = Math.floor((endDate.getTime() - startDate.getTime()) / MS_PER_DAY) + 1;
  const fullWeeks = Math.floor(daySpan / 7);
  const remainingDays = daySpan % 7;
  const hasRemainder = remainingDays > 0;
  const defaultPartialHours = hasRemainder ? hoursPerWeek * (remainingDays / 7) : 0;
  const usesPartialWeekOverride = hasRemainder && form.partialWeekHours > 0;
  const partialHours = usesPartialWeekOverride
    ? Math.max(form.partialWeekHours, 0)
    : defaultPartialHours;
  const totalHours = Math.max((fullWeeks * hoursPerWeek) + partialHours, 0);
  const totalWeeks = hoursPerWeek > 0 ? totalHours / hoursPerWeek : fullWeeks + (remainingDays / 7);

  return {
    mode: "date_range",
    totalWeeks,
    totalHours,
    totalDays: daySpan,
    fullWeeks,
    remainingDays,
    usesPartialWeekOverride,
    isDateRangeValid: true
  };
}

function buildInput(form: ScenarioFormValues): CalculationInput {
  const hourlyDuration = resolveHourlyDuration(form);
  const common = {
    stateCode: form.stateCode,
    taxYear: form.taxYear,
    filingStatus: form.filingStatus,
    ficaMode: form.ficaMode,
    preTaxDeductionsAnnual: form.preTaxDeductionsAnnual,
    payFrequency: form.payFrequency
  };

  if (form.mode === "hourly") {
    return {
      ...common,
      mode: "hourly",
      hourlyRate: form.hourlyRate,
      hoursPerWeek: form.hoursPerWeek,
      weeksPerYear: hourlyDuration.totalWeeks,
      ...(form.hourlyDurationMode === "date_range"
        ? { totalHours: hourlyDuration.totalHours }
        : {})
    };
  }

  return {
    ...common,
    mode: "salary",
    annualSalary: form.annualSalary
  };
}

function createDefaultForm(
  taxYear: number,
  mode: ScenarioFormValues["mode"] = "hourly"
): ScenarioFormValues {
  const defaultState = getStateOptionsForYear(taxYear)[0]?.code ?? "TX";
  return {
    mode,
    taxYear,
    stateCode: defaultState,
    filingStatus: "single",
    ficaMode: "exempt",
    payFrequency: "biweekly",
    preTaxDeductionsAnnual: 0,
    hourlyRate: 32,
    hoursPerWeek: 20,
    totalWeeks: 50,
    hourlyDurationMode: "weeks",
    startDate: "",
    endDate: "",
    partialWeekHours: 0,
    annualSalary: 90000
  };
}

interface TaxCalculatorProps {
  lockedMode?: ScenarioFormValues["mode"];
}

function createUniqueScenarioName(
  rawName: string,
  scenarios: SavedScenario[],
  excludedId?: string
): string {
  const base = rawName.trim() || "Scenario";
  const usedNames = new Set(
    scenarios
      .filter((scenario) => scenario.id !== excludedId)
      .map((scenario) => scenario.name.toLowerCase())
  );
  if (!usedNames.has(base.toLowerCase())) {
    return base;
  }
  let index = 2;
  let candidate = `${base} (${index})`;
  while (usedNames.has(candidate.toLowerCase())) {
    index += 1;
    candidate = `${base} (${index})`;
  }
  return candidate;
}

function enforceCompareLimit(scenarios: SavedScenario[]): SavedScenario[] {
  let compareCount = 0;
  return scenarios.map((scenario) => {
    if (scenario.compare && compareCount < MAX_COMPARE_SCENARIOS) {
      compareCount += 1;
      return scenario;
    }
    if (scenario.compare) {
      return { ...scenario, compare: false };
    }
    return scenario;
  });
}

interface ScenarioView {
  scenario: SavedScenario;
  tableVersion: string;
  result: ReturnType<typeof computeNet>;
}

interface WarningItem {
  id: string;
  tone: WarningTone;
  title: string;
  message: string;
  details?: string;
}

function compareScore(view: ScenarioView, metric: ComparisonSortMetric): number {
  if (!view.result.ok) {
    return Number.NEGATIVE_INFINITY;
  }
  if (metric === "netMonthly") {
    return view.result.value.summary.netMonthly;
  }
  if (metric === "netAnnual") {
    return view.result.value.summary.netAnnual;
  }
  if (metric === "effectiveNetHourly") {
    return view.result.value.summary.effectiveNetHourly;
  }
  return -view.result.value.summary.totalTax;
}

function formatCompareValue(view: ScenarioView, metric: ComparisonSortMetric): string {
  if (!view.result.ok) {
    return "Unavailable";
  }
  if (metric === "netMonthly") {
    return currencyFormatter.format(view.result.value.summary.netMonthly);
  }
  if (metric === "netAnnual") {
    return currencyFormatter.format(view.result.value.summary.netAnnual);
  }
  if (metric === "effectiveNetHourly") {
    return currencyFormatter.format(view.result.value.summary.effectiveNetHourly);
  }
  return currencyFormatter.format(view.result.value.summary.totalTax);
}

function errorWarningContent(errorCode?: string): Pick<WarningItem, "title" | "message" | "details"> {
  if (errorCode === "MISSING_TABLE") {
    return {
      title: "Tax table missing",
      message: "Calculation is blocked because tax tables are unavailable for this state/year combination.",
      details: "Change state/year or add the missing table data before relying on outputs."
    };
  }
  if (errorCode === "UNSUPPORTED_FILING_STATUS") {
    return {
      title: "Unsupported filing status",
      message: "Current filing status is not supported by the selected tax table.",
      details: "Switch filing status or update the table to include this status."
    };
  }
  if (errorCode === "INVALID_INPUT_RANGE") {
    return {
      title: "Invalid input",
      message: "One or more input values are outside the allowed range.",
      details: "Check negative values, total weeks, and date-range inputs."
    };
  }
  if (errorCode === "INCOMPLETE_STATE_RULE") {
    return {
      title: "Incomplete state rule",
      message: "State tax logic is incomplete for this filing status.",
      details: "Change filing status or complete this state's rule entry."
    };
  }
  return {
    title: "Unknown calculation issue",
    message: "The calculation could not be completed.",
    details: "Review state/year assumptions and retry."
  };
}

export function TaxCalculator({ lockedMode }: TaxCalculatorProps = {}) {
  const initialYear = AVAILABLE_TAX_YEARS[0] ?? 2026;
  const defaultForm = createDefaultForm(initialYear, lockedMode ?? "hourly");

  const [form, setForm] = useState<ScenarioFormValues>(defaultForm);
  const [scenarioName, setScenarioName] = useState("My Scenario");
  const [activeScenarioId, setActiveScenarioId] = useState<string | null>(null);
  const [scenarios, setScenarios] = useState<SavedScenario[]>([]);
  const [sortMetric, setSortMetric] = useState<ComparisonSortMetric>("netMonthly");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusTone, setStatusTone] = useState<StatusTone>("info");
  const [isHydrated, setIsHydrated] = useState(false);
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function pushStatus(message: string, tone: StatusTone): void {
    setStatusMessage(message);
    setStatusTone(tone);
    if (statusTimerRef.current) {
      clearTimeout(statusTimerRef.current);
    }
    statusTimerRef.current = setTimeout(() => {
      setStatusMessage(null);
      statusTimerRef.current = null;
    }, STATUS_TIMEOUT_MS);
  }

  useEffect(() => {
    const loadedScenarios = enforceCompareLimit(loadScenarios());
    setScenarios(loadedScenarios);
    setIsHydrated(true);
    return () => {
      if (statusTimerRef.current) {
        clearTimeout(statusTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }
    saveScenarios(scenarios);
  }, [isHydrated, scenarios]);

  useEffect(() => {
    if (!lockedMode) {
      return;
    }
    setForm((prev) => (prev.mode === lockedMode ? prev : { ...prev, mode: lockedMode }));
  }, [lockedMode]);

  const states = getStateOptionsForYear(form.taxYear);
  const tableVersion = getTableVersion(form.taxYear);
  const taxYearMetadata = getTaxYearMetadata(form.taxYear);
  const tables = getCalculationTables(form.taxYear, form.stateCode);
  const hourlyDuration = form.mode === "hourly" ? resolveHourlyDuration(form) : null;
  const result = computeNet(buildInput(form), tables, DEFAULT_FICA_CONFIG, tableVersion);
  const warningCode = !result.ok && result.errors.length > 0 ? result.errors[0]?.code : undefined;
  const hasMissingState = states.length > 0 && !states.some((state) => state.code === form.stateCode);
  const selectedStateLabel = states.find((state) => state.code === form.stateCode)?.label ?? form.stateCode;
  const selectedStateScopeLabel =
    form.stateCode === "PA"
      ? "Pennsylvania state tax only"
      : form.stateCode === "GA"
        ? "Georgia state tax only"
        : "State tax estimate";
  const generatedAtTimestamp = taxYearMetadata.generatedAt
    ? Date.parse(taxYearMetadata.generatedAt)
    : Number.NaN;
  const generatedAtLabel =
    Number.isNaN(generatedAtTimestamp) || !taxYearMetadata.generatedAt
      ? "Unknown"
      : dateFormatter.format(generatedAtTimestamp);
  const tableAgeDays = Number.isNaN(generatedAtTimestamp)
    ? null
    : Math.floor((Date.now() - generatedAtTimestamp) / (1000 * 60 * 60 * 24));
  const isStaleTable = tableAgeDays !== null && tableAgeDays > 365;

  const warningItems: WarningItem[] = [];
  if (form.mode === "hourly" && result.ok && tables !== null) {
    const federalBrackets = tables.federal.bracketsByStatus[form.filingStatus] ?? [];
    const federalRate = marginalRateFromBrackets(
      result.value.summary.taxableFederalIncome,
      federalBrackets
    );

    let stateRate = 0;
    if (tables.state.taxType === "flat") {
      stateRate = tables.state.flatRate;
    } else if (tables.state.taxType === "progressive") {
      const stateBrackets = tables.state.bracketsByStatus[form.filingStatus] ?? [];
      stateRate = marginalRateFromBrackets(result.value.summary.taxableStateIncome, stateBrackets);
    }

    warningItems.push({
      id: "hourly-federal-rate",
      tone: "info",
      title: "Federal tax rate",
      message: `${percentFormatter.format(federalRate)}`
    });
    warningItems.push({
      id: "hourly-state-rate",
      tone: "info",
      title: `${selectedStateLabel} state tax rate`,
      message: `${percentFormatter.format(stateRate)}`
    });
  } else {
    warningItems.push({
      id: "estimate-disclaimer",
      tone: "info",
      title: "Estimate only",
      message: "Planning estimate only. Do not use this output as official tax or legal advice."
    });
  }
  if (!taxYearMetadata.isKnown) {
    warningItems.push({
      id: "unknown-tax-year",
      tone: "warning",
      title: "Tax year not configured",
      message: `No tax metadata is configured for ${form.taxYear}.`,
      details: "Switch to a configured year or add the tax-year dataset first."
    });
  }
  if (tableVersion === "unknown") {
    warningItems.push({
      id: "unknown-table-version",
      tone: "warning",
      title: "Unknown table version",
      message: "This tax table has no version tag.",
      details: "Add a semantic version in metadata so calculations are traceable."
    });
  }
  if (isStaleTable) {
    warningItems.push({
      id: "stale-table-warning",
      tone: "caution",
      title: "Potentially stale tax table",
      message: `This table snapshot is approximately ${tableAgeDays} days old.`,
      details: "Review latest federal/state updates before making final compensation decisions."
    });
  }
  if (hasMissingState) {
    warningItems.push({
      id: "missing-state-warning",
      tone: "warning",
      title: "State unavailable for selected year",
      message: "Selected state is missing in this tax-year dataset.",
      details: `Available states: ${
        states.map((state) => state.code).join(", ") || "none configured"
      }.`
    });
  }
  if (form.stateCode === "PA") {
    warningItems.push({
      id: "philadelphia-proxy-warning",
      tone: "caution",
      title: "Philadelphia local tax not included",
      message: "Philadelphia is currently estimated using Pennsylvania state tax only.",
      details: "Philadelphia city wage tax is excluded from this planner."
    });
  }
  if (form.stateCode === "GA") {
    warningItems.push({
      id: "atlanta-proxy-warning",
      tone: "caution",
      title: "Atlanta local tax not included",
      message: "Atlanta is currently estimated using Georgia state tax only.",
      details: "City-level Atlanta taxes are excluded from this planner."
    });
  }
  if (form.ficaMode === "exempt" && form.mode !== "hourly") {
    warningItems.push({
      id: "fica-caution",
      tone: "caution",
      title: "FICA exemption is enabled",
      message: "Verify visa and residency eligibility before relying on FICA-exempt outcomes."
    });
  }
  if (
    form.mode === "hourly" &&
    form.hourlyDurationMode === "date_range" &&
    hourlyDuration !== null &&
    !hourlyDuration.isDateRangeValid
  ) {
    warningItems.push({
      id: "date-range-invalid",
      tone: "warning",
      title: "Date range is incomplete",
      message: "Set both start and end dates (end date must be on/after start date).",
      details: "Until dates are valid, the calculator falls back to Total weeks."
    });
  }
  if (!result.ok) {
    const content = errorWarningContent(warningCode);
    const domainWarning: WarningItem = {
      id: "domain-error",
      tone: "warning",
      title: content.title,
      message: content.message
    };
    if (content.details !== undefined) {
      domainWarning.details = content.details;
    }
    warningItems.push(domainWarning);
  }

  const activeScenario = scenarios.find((scenario) => scenario.id === activeScenarioId) ?? null;
  const hasUnsavedChanges =
    activeScenario !== null &&
    (activeScenario.name !== scenarioName ||
      JSON.stringify(activeScenario.form) !== JSON.stringify(form));

  const sortedScenarios = [...scenarios].sort((a, b) => {
    if (a.pinned !== b.pinned) {
      return a.pinned ? -1 : 1;
    }
    return b.updatedAt - a.updatedAt;
  });

  const modeScopedScenarios = lockedMode
    ? sortedScenarios.filter((scenario) => scenario.form.mode === lockedMode)
    : sortedScenarios;

  const scenarioViews: ScenarioView[] = modeScopedScenarios.map((scenario) => {
    const scenarioTableVersion = getTableVersion(scenario.form.taxYear);
    const scenarioTables = getCalculationTables(scenario.form.taxYear, scenario.form.stateCode);
    return {
      scenario,
      tableVersion: scenarioTableVersion,
      result: computeNet(buildInput(scenario.form), scenarioTables, DEFAULT_FICA_CONFIG, scenarioTableVersion)
    };
  });

  const compareViews = scenarioViews.filter((view) => view.scenario.compare);
  const rankedCompareViews = [...compareViews].sort((a, b) => {
    const delta = compareScore(b, sortMetric) - compareScore(a, sortMetric);
    if (delta !== 0) {
      return delta;
    }
    return b.scenario.updatedAt - a.scenario.updatedAt;
  });
  const bestScenarioId = rankedCompareViews[0]?.scenario.id ?? null;
  const summary = result.ok ? result.value.summary : null;
  const grossIncomeLabel = form.mode === "hourly" ? "Gross income (total)" : "Gross annual income";
  const netIncomeLabel = form.mode === "hourly" ? "Net income (total)" : "Net annual income";
  const grossBiweeklyLabel =
    form.mode === "hourly" ? "Bi-weekly gross (2-week equivalent)" : "Gross bi-weekly pay";
  const netBiweeklyLabel =
    form.mode === "hourly" ? "Bi-weekly net (2-week equivalent)" : "Bi-weekly net income";
  const biweeklyTaxLabel =
    form.mode === "hourly" ? "Bi-weekly taxes (2-week equivalent)" : "Total bi-weekly taxes";
  const viewModeLabel =
    lockedMode === "hourly" ? "hourly" : lockedMode === "salary" ? "salary" : "hourly and salary";
  const federalRateOfGross = summary
    ? ratioOrZero(summary.federalTax, summary.grossAnnualIncome)
    : 0;
  const stateRateOfGross = summary ? ratioOrZero(summary.stateTax, summary.grossAnnualIncome) : 0;
  const ficaRateOfGross = summary ? ratioOrZero(summary.ficaTax, summary.grossAnnualIncome) : 0;
  const federalRateOfTaxable = summary
    ? ratioOrZero(summary.federalTax, summary.taxableFederalIncome)
    : 0;
  const stateRateOfTaxable = summary
    ? ratioOrZero(summary.stateTax, summary.taxableStateIncome)
    : 0;

  function resetInputs(): void {
    setForm(createDefaultForm(form.taxYear, lockedMode ?? "hourly"));
    setScenarioName("My Scenario");
    setActiveScenarioId(null);
    pushStatus("Inputs reset to defaults.", "info");
  }

  function loadScenario(scenarioId: string): void {
    const scenario = scenarios.find((item) => item.id === scenarioId);
    if (!scenario) {
      return;
    }
    if (lockedMode && scenario.form.mode !== lockedMode) {
      pushStatus("This page is locked to a different mode.", "warning");
      return;
    }
    setForm(scenario.form);
    setScenarioName(scenario.name);
    setActiveScenarioId(scenario.id);
    pushStatus(`Loaded scenario "${scenario.name}".`, "info");
  }

  function saveCurrentScenario(): void {
    if (!result.ok) {
      pushStatus("Cannot save: fix invalid inputs first.", "warning");
      return;
    }
    const now = Date.now();
    const nextForm = lockedMode ? { ...form, mode: lockedMode } : form;
    if (activeScenarioId) {
      const savedName = createUniqueScenarioName(scenarioName, scenarios, activeScenarioId);
      setScenarios((prev) =>
        prev.map((scenario) =>
          scenario.id === activeScenarioId
            ? { ...scenario, name: savedName, form: nextForm, updatedAt: now }
            : scenario
        )
      );
      setScenarioName(savedName);
      pushStatus(`Scenario "${savedName}" updated.`, "success");
      return;
    }

    const savedName = createUniqueScenarioName(scenarioName, scenarios);
    const newScenario: SavedScenario = {
      id: createScenarioId(),
      name: savedName,
      pinned: false,
      compare: false,
      createdAt: now,
      updatedAt: now,
      form: nextForm
    };
    setScenarios((prev) => [newScenario, ...prev]);
    setScenarioName(savedName);
    setActiveScenarioId(newScenario.id);
    pushStatus(`Scenario "${savedName}" saved.`, "success");
  }

  function duplicateScenario(scenarioId: string): void {
    const source = scenarios.find((scenario) => scenario.id === scenarioId);
    if (!source) {
      return;
    }
    if (lockedMode && source.form.mode !== lockedMode) {
      pushStatus("This page is locked to a different mode.", "warning");
      return;
    }
    const now = Date.now();
    const duplicateName = createUniqueScenarioName(source.name, scenarios);
    const duplicate: SavedScenario = {
      ...source,
      id: createScenarioId(),
      name: duplicateName,
      pinned: false,
      compare: false,
      createdAt: now,
      updatedAt: now
    };
    setScenarios((prev) => [duplicate, ...prev]);
    setForm(duplicate.form);
    setScenarioName(duplicate.name);
    setActiveScenarioId(duplicate.id);
    pushStatus(`Created duplicate "${duplicate.name}".`, "success");
  }

  function deleteScenario(scenarioId: string): void {
    const target = scenarios.find((scenario) => scenario.id === scenarioId);
    if (!target) {
      return;
    }
    setScenarios((prev) => prev.filter((scenario) => scenario.id !== scenarioId));
    if (activeScenarioId === scenarioId) {
      setActiveScenarioId(null);
      setScenarioName("My Scenario");
    }
    pushStatus(`Deleted scenario "${target.name}".`, "info");
  }

  function togglePin(scenarioId: string): void {
    setScenarios((prev) =>
      prev.map((scenario) =>
        scenario.id === scenarioId
          ? { ...scenario, pinned: !scenario.pinned, updatedAt: Date.now() }
          : scenario
      )
    );
  }

  function toggleCompare(scenarioId: string): void {
    const candidate = scenarios.find((scenario) => scenario.id === scenarioId);
    if (!candidate) {
      return;
    }
    if (lockedMode && candidate.form.mode !== lockedMode) {
      pushStatus("This page is locked to a different mode.", "warning");
      return;
    }
    if (!candidate.compare) {
      const selectedCount = scenarios.filter(
        (scenario) => scenario.compare && (!lockedMode || scenario.form.mode === lockedMode)
      ).length;
      if (selectedCount >= MAX_COMPARE_SCENARIOS) {
        pushStatus(`You can compare up to ${MAX_COMPARE_SCENARIOS} scenarios.`, "warning");
        return;
      }
    }
    setScenarios((prev) =>
      prev.map((scenario) =>
        scenario.id === scenarioId ? { ...scenario, compare: !scenario.compare } : scenario
      )
    );
  }

  return (
    <main className="page-shell workspace-shell">
      <p className="sr-only" aria-live="polite">
        {statusMessage ?? ""}
      </p>

      <section className="hero hero-compact">
        <p className="eyebrow">Compensation Planner</p>
        <h1>Model take-home pay across {viewModeLabel} scenarios</h1>
        <p className="subtitle">
          Compare locations, pay structures, and tax assumptions side by side. Use it for planning, not formal
          tax or legal advice.
        </p>
        {lockedMode ? (
          <Link href="/" className="back-link">
            Back to home
          </Link>
        ) : null}
      </section>

      <section className="workspace">
        <article className="panel form-panel reveal">
          <h2>Inputs</h2>
          <section className="context-panel">
            <div className="context-grid">
              <div className="context-item">
                <span className="context-label">Route</span>
                <strong className="context-value">
                  {lockedMode === "hourly" ? "Hourly planner" : lockedMode === "salary" ? "Salary planner" : "Flexible planner"}
                </strong>
              </div>
              <div className="context-item">
                <span className="context-label">Planning profile</span>
                <strong className="context-value">
                  {form.filingStatus === "single" ? "Single" : "Married filing jointly"}
                </strong>
              </div>
              <div className="context-item">
                <span className="context-label">FICA treatment</span>
                <strong className="context-value">
                  {form.ficaMode === "exempt" ? "FICA exempt" : "Standard FICA"}
                </strong>
              </div>
              <div className="context-item">
                <span className="context-label">Pay cadence</span>
                <strong className="context-value">
                  {form.payFrequency === "biweekly"
                    ? "Bi-weekly"
                    : form.payFrequency === "semimonthly"
                      ? "Semi-monthly"
                      : "Monthly"}
                </strong>
              </div>
            </div>
            <p className="context-note">
              Keep these assumptions aligned with your real payroll setup before using the estimate for a final
              decision.
            </p>
          </section>

          <div className="field-grid two-col">
            {lockedMode ? null : (
              <label>
                Mode
                <select
                  value={form.mode}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, mode: event.target.value as ScenarioFormValues["mode"] }))
                  }
                >
                  <option value="hourly">Hourly</option>
                  <option value="salary">Salary</option>
                </select>
              </label>
            )}

            <label>
              Tax year
              <select
                value={form.taxYear}
                onChange={(event) => {
                  const nextYear = Number(event.target.value);
                  const nextStates = getStateOptionsForYear(nextYear);
                  const fallbackState = nextStates[0]?.code ?? "";
                  setForm((prev) => ({
                    ...prev,
                    taxYear: nextYear,
                    stateCode: nextStates.some((state) => state.code === prev.stateCode)
                      ? prev.stateCode
                      : fallbackState
                  }));
                }}
              >
                {AVAILABLE_TAX_YEARS.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </label>

            <label>
              State
              <select
                value={form.stateCode}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, stateCode: event.target.value }))
                }
              >
                {states.map((state) => (
                  <option key={state.code} value={state.code}>
                    {state.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Filing status
              <select
                value={form.filingStatus}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    filingStatus: event.target.value as ScenarioFormValues["filingStatus"]
                  }))
                }
              >
                <option value="single">Single</option>
                <option value="married_joint">Married filing jointly</option>
              </select>
            </label>

            <label>
              FICA mode
              <select
                value={form.ficaMode}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    ficaMode: event.target.value as ScenarioFormValues["ficaMode"]
                  }))
                }
              >
                <option value="standard">Standard FICA</option>
                <option value="exempt">FICA exempt</option>
              </select>
            </label>

            <label>
              Pay frequency
              <select
                value={form.payFrequency}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    payFrequency: event.target.value as ScenarioFormValues["payFrequency"]
                  }))
                }
              >
                <option value="monthly">Monthly</option>
                <option value="biweekly">Bi-weekly</option>
                <option value="semimonthly">Semi-monthly</option>
              </select>
            </label>

            <label>
              Pre-tax deductions (annual)
              <input
                type="number"
                min={0}
                step={100}
                value={form.preTaxDeductionsAnnual}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    preTaxDeductionsAnnual: parseNumber(event.target.value)
                  }))
                }
              />
            </label>
          </div>

          {form.mode === "hourly" ? (
            <>
              <div className="field-grid three-col">
                <label>
                  Hourly rate
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={form.hourlyRate}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, hourlyRate: parseNumber(event.target.value) }))
                    }
                  />
                </label>

                <label>
                  Hours/week
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={form.hoursPerWeek}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        hoursPerWeek: parseNumber(event.target.value)
                      }))
                    }
                  />
                </label>

                <label>
                  Duration input
                  <select
                    value={form.hourlyDurationMode}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        hourlyDurationMode: event.target.value as ScenarioFormValues["hourlyDurationMode"]
                      }))
                    }
                  >
                    <option value="weeks">Total weeks</option>
                    <option value="date_range">Date range</option>
                  </select>
                </label>
              </div>

              {form.hourlyDurationMode === "weeks" ? (
                <div className="field-grid">
                  <label>
                    Total weeks
                    <input
                      type="number"
                      min={0.1}
                      step={0.1}
                      value={form.totalWeeks}
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          totalWeeks: parseNumber(event.target.value)
                        }))
                      }
                    />
                  </label>
                </div>
              ) : (
                <div className="field-grid three-col">
                  <label>
                    Start date
                    <input
                      type="date"
                      value={form.startDate}
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          startDate: event.target.value
                        }))
                      }
                    />
                  </label>

                  <label>
                    End date
                    <input
                      type="date"
                      value={form.endDate}
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          endDate: event.target.value
                        }))
                      }
                    />
                  </label>

                  <label>
                    Final partial week hours (optional)
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      value={form.partialWeekHours}
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          partialWeekHours: parseNumber(event.target.value)
                        }))
                      }
                    />
                  </label>
                </div>
              )}

              {hourlyDuration ? (
                <p className="input-hint">
                  {form.hourlyDurationMode === "date_range" ? (
                    hourlyDuration.isDateRangeValid ? (
                      <>
                        Date range resolves to {hourlyDuration.fullWeeks} full week(s)
                        {hourlyDuration.remainingDays > 0
                          ? ` + ${hourlyDuration.remainingDays} day(s)`
                          : ""}
                        . Total = {hourlyDuration.totalWeeks.toFixed(2)} weeks (
                        {hourlyDuration.totalHours.toFixed(1)} hours)
                        {hourlyDuration.usesPartialWeekOverride
                          ? ". Partial-week override applied."
                          : "."}
                      </>
                    ) : (
                      <>Enter a valid start and end date to auto-calculate total weeks and hours.</>
                    )
                  ) : (
                    <>Total contract hours: {hourlyDuration.totalHours.toFixed(1)} hours.</>
                  )}
                </p>
              ) : null}
            </>
          ) : (
            <div className="field-grid">
              <label>
                Annual salary
                <input
                  type="number"
                  min={0}
                  step={1000}
                  value={form.annualSalary}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      annualSalary: parseNumber(event.target.value)
                    }))
                  }
                />
              </label>
            </div>
          )}

          <section className="scenario-workspace">
            <h3>Scenario workspace</h3>
            <div className="scenario-toolbar">
              <label>
                Scenario name
                <input
                  type="text"
                  maxLength={80}
                  value={scenarioName}
                  onChange={(event) => setScenarioName(event.target.value)}
                />
              </label>
              <div className="button-row">
                <button type="button" className="btn btn-primary" onClick={saveCurrentScenario}>
                  Save Scenario
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    if (activeScenarioId) {
                      duplicateScenario(activeScenarioId);
                    }
                  }}
                  disabled={!activeScenarioId}
                >
                  Duplicate
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => {
                    if (activeScenarioId) {
                      deleteScenario(activeScenarioId);
                    }
                  }}
                  disabled={!activeScenarioId}
                >
                  Delete
                </button>
                <button type="button" className="btn btn-secondary" onClick={resetInputs}>
                  Reset Inputs
                </button>
              </div>
            </div>

            {statusMessage ? <p className={`pill ${statusTone}`}>{statusMessage}</p> : null}
            {hasUnsavedChanges ? (
              <p className="pill warning">You have unsaved changes in the active scenario.</p>
            ) : null}

            <div className="scenario-list-wrap">
              <h4>Saved scenarios</h4>
              {isHydrated && scenarioViews.length === 0 ? (
                <p className="empty-state">No saved scenarios yet. Save your current setup to start comparing.</p>
              ) : (
                <ul className="scenario-list">
                  {scenarioViews.map((view) => {
                    const isActive = view.scenario.id === activeScenarioId;
                    const monthlyLabel =
                      view.result.ok
                        ? currencyFormatter.format(view.result.value.summary.netMonthly)
                        : "Unavailable";

                    return (
                      <li
                        key={view.scenario.id}
                        className={`scenario-item ${isActive ? "active" : ""} ${
                          view.scenario.compare ? "compare-on" : ""
                        }`}
                      >
                        <div className="scenario-item-head">
                          <p className="scenario-name" title={view.scenario.name}>
                            {view.scenario.name}
                          </p>
                          {view.scenario.pinned ? <span className="chip">Pinned</span> : null}
                        </div>
                        <p className="scenario-meta">
                          {view.scenario.form.mode === "hourly" ? "Hourly" : "Salary"} ·{" "}
                          {view.scenario.form.stateCode} · {view.scenario.form.taxYear}
                        </p>
                        <p className="scenario-meta">Net monthly: {monthlyLabel}</p>
                        <p className="scenario-meta">Updated: {dateFormatter.format(view.scenario.updatedAt)}</p>
                        <p className="scenario-meta">Table: {view.tableVersion}</p>

                        <div className="scenario-item-actions">
                          <label className="compare-check">
                            <input
                              type="checkbox"
                              checked={view.scenario.compare}
                              onChange={() => toggleCompare(view.scenario.id)}
                            />
                            Compare
                          </label>
                          <button
                            type="button"
                            className="mini-btn"
                            onClick={() => loadScenario(view.scenario.id)}
                          >
                            Load
                          </button>
                          <button
                            type="button"
                            className="mini-btn"
                            onClick={() => togglePin(view.scenario.id)}
                          >
                            {view.scenario.pinned ? "Unpin" : "Pin"}
                          </button>
                          <button
                            type="button"
                            className="mini-btn"
                            onClick={() => duplicateScenario(view.scenario.id)}
                          >
                            Duplicate
                          </button>
                          <button
                            type="button"
                            className="mini-btn danger"
                            onClick={() => deleteScenario(view.scenario.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>
        </article>

        <article className="panel summary-panel reveal">
          <h2>Summary</h2>
          <p className="meta-row">
            Table version: <strong>{tableVersion}</strong> · Year: <strong>{form.taxYear}</strong> ·
            Updated: <strong>{generatedAtLabel}</strong>
          </p>
          <p className="meta-row">
            State: <strong>{selectedStateLabel}</strong> · Scope: <strong>{selectedStateScopeLabel}</strong> ·
            Filing status: <strong>{form.filingStatus === "single" ? "Single" : "Married filing jointly"}</strong>
            {" "}· FICA: <strong>{form.ficaMode === "exempt" ? "Exempt" : "Standard"}</strong> · Frequency:{" "}
            <strong>
              {form.payFrequency === "biweekly"
                ? "Bi-weekly"
                : form.payFrequency === "semimonthly"
                  ? "Semi-monthly"
                  : "Monthly"}
            </strong>
          </p>

          {!isHydrated ? <p className="pill info">Loading saved scenarios...</p> : null}
          <section className="warning-center">
            {warningItems.map((item) =>
              item.details ? (
                <details key={item.id} className={`warning-card ${item.tone}`}>
                  <summary>{item.title}</summary>
                  <p>{item.message}</p>
                  <p className="warning-detail">{item.details}</p>
                </details>
              ) : (
                <article key={item.id} className={`warning-card ${item.tone}`}>
                  <h4>{item.title}</h4>
                  <p>{item.message}</p>
                </article>
              )
            )}
          </section>

          {taxYearMetadata.sources.length > 0 ? (
            <details className="metadata-panel">
              <summary>Tax data sources ({taxYearMetadata.sources.length})</summary>
              <ul>
                {taxYearMetadata.sources.map((source) => (
                  <li key={`${source.scope}-${source.url}`}>
                    <span>
                      {source.scope.toUpperCase()} · {source.label}
                    </span>
                    <a href={source.url} target="_blank" rel="noreferrer">
                      Open source
                    </a>
                  </li>
                ))}
              </ul>
              {taxYearMetadata.notes ? <p className="metadata-note">{taxYearMetadata.notes}</p> : null}
            </details>
          ) : null}

          {result.ok ? (
            <div className="stat-grid">
              <div className="stat-card emphasis">
                <span>{grossIncomeLabel}</span>
                <strong>{currencyFormatter.format(result.value.summary.grossAnnualIncome)}</strong>
              </div>
              <div className="stat-card">
                <span>{netIncomeLabel}</span>
                <strong>{currencyFormatter.format(result.value.summary.netAnnual)}</strong>
              </div>
              <div className="stat-card">
                <span>{grossBiweeklyLabel}</span>
                <strong>{currencyFormatter.format(result.value.summary.grossBiweekly)}</strong>
              </div>
              <div className="stat-card">
                <span>{netBiweeklyLabel}</span>
                <strong>{currencyFormatter.format(result.value.summary.netBiweekly)}</strong>
              </div>
              <div className="stat-card">
                <span>Total taxes</span>
                <strong>{currencyFormatter.format(result.value.summary.totalTax)}</strong>
              </div>
              <div className="stat-card">
                <span>{biweeklyTaxLabel}</span>
                <strong>{currencyFormatter.format(result.value.summary.totalBiweeklyTax)}</strong>
              </div>
              <div className="stat-card">
                <span>Total tax percentage</span>
                <strong>{percentFormatter.format(result.value.summary.effectiveTaxRate)}</strong>
              </div>
              {form.mode === "salary" ? (
                <div className="stat-card">
                  <span>Gross monthly pay</span>
                  <strong>{currencyFormatter.format(result.value.summary.grossMonthly)}</strong>
                </div>
              ) : null}
              {form.mode === "salary" ? (
                <div className="stat-card">
                  <span>Net monthly (reference)</span>
                  <strong>{currencyFormatter.format(result.value.summary.netMonthly)}</strong>
                </div>
              ) : null}
              <div className="stat-card">
                <span>Effective net hourly</span>
                <strong>{currencyFormatter.format(result.value.summary.effectiveNetHourly)}</strong>
              </div>
            </div>
          ) : (
            <div className="stat-grid">
              <div className="stat-card">
                <span>Status</span>
                <strong>Waiting for valid inputs</strong>
              </div>
            </div>
          )}

          {result.ok ? (
            <div className="breakdown">
              <h3>Tax breakdown</h3>
              <div className="line-item rich">
                <div>
                  <span>Federal income tax</span>
                  <p className="line-subtext">
                    {percentFormatter.format(federalRateOfGross)} of gross ·{" "}
                    {percentFormatter.format(federalRateOfTaxable)} effective on federal taxable income
                  </p>
                </div>
                <strong>{currencyFormatter.format(result.value.summary.federalTax)}</strong>
              </div>
              <div className="line-item rich">
                <div>
                  <span>State income tax</span>
                  <p className="line-subtext">
                    {percentFormatter.format(stateRateOfGross)} of gross ·{" "}
                    {percentFormatter.format(stateRateOfTaxable)} effective on state taxable income
                  </p>
                </div>
                <strong>{currencyFormatter.format(result.value.summary.stateTax)}</strong>
              </div>
              <div className="line-item rich">
                <div>
                  <span>FICA</span>
                  <p className="line-subtext">
                    {percentFormatter.format(ficaRateOfGross)} of gross · configured assumption: Exempt
                  </p>
                </div>
                <strong>{currencyFormatter.format(result.value.summary.ficaTax)}</strong>
              </div>
            </div>
          ) : null}

          <section className="comparison-board">
            <h3>Comparison board</h3>
            <div className="compare-toolbar">
              <label>
                Sort by
                <select
                  value={sortMetric}
                  onChange={(event) =>
                    setSortMetric(event.target.value as ComparisonSortMetric)
                  }
                >
                  <option value="netMonthly">Best net monthly</option>
                  <option value="netAnnual">Best net annual</option>
                  <option value="effectiveNetHourly">Best effective net hourly</option>
                  <option value="totalTax">Lowest total tax</option>
                </select>
              </label>
              <p className="compare-count">
                {compareViews.length}/{MAX_COMPARE_SCENARIOS} selected
              </p>
            </div>

            {compareViews.length === 0 ? (
              <p className="empty-state">Select scenarios in the list to start comparing.</p>
            ) : null}
            {compareViews.length === 1 ? (
              <p className="empty-state">Select one more scenario to unlock side-by-side comparison.</p>
            ) : null}

            {compareViews.length >= 2 ? (
              <>
                <div className="compare-table-wrap">
                  <table className="compare-table">
                    <thead>
                      <tr>
                        <th scope="col">Metric</th>
                        {rankedCompareViews.map((view) => (
                          <th
                            key={view.scenario.id}
                            scope="col"
                            className={bestScenarioId === view.scenario.id ? "best-col" : ""}
                            title={view.scenario.name}
                          >
                            <span className="col-title">{view.scenario.name}</span>
                            {bestScenarioId === view.scenario.id ? (
                              <span className="best-tag">Best</span>
                            ) : null}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(
                        [
                          ["netMonthly", "Net monthly"],
                          ["netAnnual", "Net annual"],
                          ["effectiveNetHourly", "Effective net hourly"],
                          ["totalTax", "Total tax"]
                        ] as Array<[ComparisonSortMetric, string]>
                      ).map(([metricKey, label]) => (
                        <tr key={metricKey}>
                          <th scope="row">{label}</th>
                          {rankedCompareViews.map((view) => (
                            <td
                              key={`${view.scenario.id}-${metricKey}`}
                              className={bestScenarioId === view.scenario.id ? "best-col" : ""}
                            >
                              {formatCompareValue(view, metricKey)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="compare-cards">
                  {rankedCompareViews.map((view) => (
                    <article
                      key={`${view.scenario.id}-card`}
                      className={`compare-card ${
                        bestScenarioId === view.scenario.id ? "best-col" : ""
                      }`}
                    >
                      <h4 title={view.scenario.name}>{view.scenario.name}</h4>
                      <p>
                        Net monthly: <strong>{formatCompareValue(view, "netMonthly")}</strong>
                      </p>
                      <p>
                        Net annual: <strong>{formatCompareValue(view, "netAnnual")}</strong>
                      </p>
                      <p>
                        Effective net hourly:{" "}
                        <strong>{formatCompareValue(view, "effectiveNetHourly")}</strong>
                      </p>
                      <p>
                        Total tax: <strong>{formatCompareValue(view, "totalTax")}</strong>
                      </p>
                    </article>
                  ))}
                </div>
              </>
            ) : null}
          </section>
        </article>
      </section>
    </main>
  );
}

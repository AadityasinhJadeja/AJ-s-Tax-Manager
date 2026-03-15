"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { computeNet, DEFAULT_FICA_CONFIG } from "@/src/domain/tax/engine";
import {
  AVAILABLE_TAX_YEARS,
  getCalculationTables,
  getTaxYearMetadata,
  getStateOptionsForYear,
  getTableVersion
} from "@/src/data/tax/tables";
import {
  createSalaryScenarioId,
  loadSalaryScenarios,
  saveSalaryScenarios,
  type SalaryScenarioFormValues,
  type SavedSalaryScenario
} from "./store";

type ComparisonSortMetric = "netMonthly" | "netAnnual" | "effectiveHourlyIncome" | "totalTax";
type StatusTone = "info" | "success" | "warning";
type WarningTone = "info" | "warning" | "caution";

interface SalaryDisplaySummary {
  annual401kContribution: number;
  biweekly401kContribution: number;
  grossAnnualIncome: number;
  grossMonthlyIncome: number;
  grossBiweeklyIncome: number;
  federalTax: number;
  stateTax: number;
  ficaTax: number;
  totalTax: number;
  totalTaxPercentage: number;
  totalBiweeklyTax: number;
  netAnnualIncome: number;
  netMonthlyIncome: number;
  netBiweeklyIncome: number;
  effectiveHourlyIncome: number;
}

interface SalaryScenarioView {
  scenario: SavedSalaryScenario;
  tableVersion: string;
  calculation: ReturnType<typeof calculateSalaryResult>;
}

interface WarningItem {
  id: string;
  tone: WarningTone;
  title: string;
  message: string;
  details?: string;
}

const MAX_COMPARE_SCENARIOS = 4;
const STATUS_TIMEOUT_MS = 2600;

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

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(Math.max(value, 0), 100);
}

function roundToCents(value: number): number {
  return Math.round(value * 100) / 100;
}

function ratioOrZero(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    return 0;
  }
  return numerator / denominator;
}

function createDefaultForm(taxYear: number): SalaryScenarioFormValues {
  const defaultState = getStateOptionsForYear(taxYear)[0]?.code ?? "TX";
  return {
    taxYear,
    stateCode: defaultState,
    annualSalary: 90000,
    contribution401kPercent: 0
  };
}

function createUniqueScenarioName(
  rawName: string,
  scenarios: SavedSalaryScenario[],
  excludedId?: string
): string {
  const base = rawName.trim() || "Salary Scenario";
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

function enforceCompareLimit(scenarios: SavedSalaryScenario[]): SavedSalaryScenario[] {
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

function errorWarningContent(errorCode?: string): Pick<WarningItem, "title" | "message" | "details"> {
  if (errorCode === "MISSING_TABLE") {
    return {
      title: "Tax table missing",
      message: "Calculation is blocked because tax tables are unavailable for this state.",
      details: "Switch to a supported state or add the missing state tax dataset."
    };
  }
  if (errorCode === "INVALID_INPUT_RANGE") {
    return {
      title: "Invalid input",
      message: "One or more salary inputs are outside the allowed range.",
      details: "Check annual salary and 401(k) percentage values."
    };
  }
  return {
    title: "Calculation issue",
    message: "The salary estimate could not be completed.",
    details: "Review the selected state and input values, then try again."
  };
}

function calculateSalaryResult(form: SalaryScenarioFormValues) {
  const tableVersion = getTableVersion(form.taxYear);
  const tables = getCalculationTables(form.taxYear, form.stateCode);
  const annual401kContribution = roundToCents(
    Math.max(form.annualSalary, 0) * (clampPercent(form.contribution401kPercent) / 100)
  );

  const result = computeNet(
    {
      mode: "salary",
      annualSalary: form.annualSalary,
      annualHoursForEffectiveRate: 2080,
      stateCode: form.stateCode,
      taxYear: form.taxYear,
      filingStatus: "single",
      ficaMode: "exempt",
      payFrequency: "biweekly",
      preTaxDeductionsAnnual: annual401kContribution
    },
    tables,
    DEFAULT_FICA_CONFIG,
    tableVersion
  );

  if (!result.ok) {
    return {
      ok: false as const,
      tableVersion,
      tables,
      annual401kContribution,
      result
    };
  }

  const grossAnnualIncome = result.value.summary.grossAnnualIncome;
  const grossBiweeklyIncome = result.value.summary.grossBiweekly;
  const grossMonthlyIncome = result.value.summary.grossMonthly;
  const biweekly401kContribution = roundToCents(annual401kContribution / 26);
  const totalBiweeklyTax = roundToCents(result.value.summary.totalTax / 26);
  const netAnnualIncome = roundToCents(
    grossAnnualIncome - annual401kContribution - result.value.summary.totalTax
  );
  const netBiweeklyIncome = roundToCents(
    grossBiweeklyIncome - biweekly401kContribution - totalBiweeklyTax
  );
  const netMonthlyIncome = roundToCents(netAnnualIncome / 12);
  const effectiveHourlyIncome = roundToCents(netAnnualIncome / 2080);

  const summary: SalaryDisplaySummary = {
    annual401kContribution,
    biweekly401kContribution,
    grossAnnualIncome,
    grossMonthlyIncome,
    grossBiweeklyIncome,
    federalTax: result.value.summary.federalTax,
    stateTax: result.value.summary.stateTax,
    ficaTax: result.value.summary.ficaTax,
    totalTax: result.value.summary.totalTax,
    totalTaxPercentage: ratioOrZero(result.value.summary.totalTax, grossAnnualIncome),
    totalBiweeklyTax,
    netAnnualIncome,
    netMonthlyIncome,
    netBiweeklyIncome,
    effectiveHourlyIncome
  };

  return {
    ok: true as const,
    tableVersion,
    tables,
    annual401kContribution,
    result,
    summary
  };
}

function compareScore(view: SalaryScenarioView, metric: ComparisonSortMetric): number {
  if (!view.calculation.ok) {
    return Number.NEGATIVE_INFINITY;
  }

  if (metric === "netMonthly") {
    return view.calculation.summary.netMonthlyIncome;
  }
  if (metric === "netAnnual") {
    return view.calculation.summary.netAnnualIncome;
  }
  if (metric === "effectiveHourlyIncome") {
    return view.calculation.summary.effectiveHourlyIncome;
  }
  return -view.calculation.summary.totalTax;
}

function formatCompareValue(view: SalaryScenarioView, metric: ComparisonSortMetric): string {
  if (!view.calculation.ok) {
    return "Unavailable";
  }

  if (metric === "netMonthly") {
    return currencyFormatter.format(view.calculation.summary.netMonthlyIncome);
  }
  if (metric === "netAnnual") {
    return currencyFormatter.format(view.calculation.summary.netAnnualIncome);
  }
  if (metric === "effectiveHourlyIncome") {
    return currencyFormatter.format(view.calculation.summary.effectiveHourlyIncome);
  }
  return currencyFormatter.format(view.calculation.summary.totalTax);
}

export function SalaryCalculatorPage() {
  const initialYear = AVAILABLE_TAX_YEARS[0] ?? 2026;
  const [form, setForm] = useState<SalaryScenarioFormValues>(() => createDefaultForm(initialYear));
  const [scenarioName, setScenarioName] = useState("Salary Scenario");
  const [activeScenarioId, setActiveScenarioId] = useState<string | null>(null);
  const [scenarios, setScenarios] = useState<SavedSalaryScenario[]>([]);
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
    setScenarios(enforceCompareLimit(loadSalaryScenarios()));
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
    saveSalaryScenarios(scenarios);
  }, [isHydrated, scenarios]);

  const states = getStateOptionsForYear(form.taxYear);
  const taxYearMetadata = getTaxYearMetadata(form.taxYear);
  const calculation = calculateSalaryResult(form);
  const warningCode =
    !calculation.result.ok && calculation.result.errors.length > 0
      ? calculation.result.errors[0]?.code
      : undefined;
  const selectedStateLabel = states.find((state) => state.code === form.stateCode)?.label ?? form.stateCode;
  const selectedStateScopeLabel =
    form.stateCode === "PA"
      ? "Pennsylvania state tax only"
      : form.stateCode === "GA"
        ? "Georgia state tax only"
        : "State tax estimate";
  const hasMissingState = states.length > 0 && !states.some((state) => state.code === form.stateCode);
  const generatedAtTimestamp = taxYearMetadata.generatedAt
    ? Date.parse(taxYearMetadata.generatedAt)
    : Number.NaN;
  const generatedAtLabel =
    Number.isNaN(generatedAtTimestamp) || !taxYearMetadata.generatedAt
      ? "Unknown"
      : dateFormatter.format(generatedAtTimestamp);
  const tableAgeDays =
    Number.isNaN(generatedAtTimestamp) ? null : Math.floor((Date.now() - generatedAtTimestamp) / 86400000);
  const isStaleTable = tableAgeDays !== null && tableAgeDays > 365;
  const summary = calculation.ok ? calculation.summary : null;
  const federalRateOfGross = summary ? ratioOrZero(summary.federalTax, summary.grossAnnualIncome) : 0;
  const stateRateOfGross = summary ? ratioOrZero(summary.stateTax, summary.grossAnnualIncome) : 0;

  const warningItems: WarningItem[] = [];
  if (summary) {
    warningItems.push({
      id: "federal-tax-rate",
      tone: "info",
      title: "Federal tax percentage",
      message: `${percentFormatter.format(federalRateOfGross)} of gross income`,
      details: `Estimated federal tax: ${currencyFormatter.format(summary.federalTax)}`
    });
    warningItems.push({
      id: "state-tax-rate",
      tone: "info",
      title: `${selectedStateLabel} tax percentage`,
      message: `${percentFormatter.format(stateRateOfGross)} of gross income`,
      details: `Estimated state tax: ${currencyFormatter.format(summary.stateTax)}`
    });
  }

  if (!taxYearMetadata.isKnown) {
    warningItems.push({
      id: "unknown-tax-year",
      tone: "warning",
      title: "Tax year not configured",
      message: `No tax metadata is configured for ${form.taxYear}.`,
      details: "Switch to a configured tax year or add the missing dataset."
    });
  }
  if (calculation.tableVersion === "unknown") {
    warningItems.push({
      id: "unknown-table-version",
      tone: "warning",
      title: "Unknown table version",
      message: "This tax table has no version tag.",
      details: "Add a semantic version so salary calculations remain traceable."
    });
  }
  if (isStaleTable) {
    warningItems.push({
      id: "stale-table-warning",
      tone: "caution",
      title: "Potentially stale tax table",
      message: `This tax table snapshot is approximately ${tableAgeDays} days old.`,
      details: "Review the latest tax changes before using this for a final decision."
    });
  }
  if (hasMissingState) {
    warningItems.push({
      id: "missing-state",
      tone: "warning",
      title: "State unavailable for selected year",
      message: "The selected state is missing in this tax dataset.",
      details: `Available states: ${states.map((state) => state.code).join(", ") || "none configured"}.`
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
  if (!calculation.result.ok) {
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

  const scenarioViews: SalaryScenarioView[] = sortedScenarios.map((scenario) => ({
    scenario,
    tableVersion: getTableVersion(scenario.form.taxYear),
    calculation: calculateSalaryResult(scenario.form)
  }));

  const compareViews = scenarioViews.filter((view) => view.scenario.compare);
  const rankedCompareViews = [...compareViews].sort((a, b) => {
    const delta = compareScore(b, sortMetric) - compareScore(a, sortMetric);
    if (delta !== 0) {
      return delta;
    }
    return b.scenario.updatedAt - a.scenario.updatedAt;
  });
  const bestScenarioId = rankedCompareViews[0]?.scenario.id ?? null;

  function resetInputs(): void {
    setForm(createDefaultForm(form.taxYear));
    setScenarioName("Salary Scenario");
    setActiveScenarioId(null);
    pushStatus("Salary inputs reset to defaults.", "info");
  }

  function loadScenario(scenarioId: string): void {
    const scenario = scenarios.find((item) => item.id === scenarioId);
    if (!scenario) {
      return;
    }

    setForm(scenario.form);
    setScenarioName(scenario.name);
    setActiveScenarioId(scenario.id);
    pushStatus(`Loaded scenario "${scenario.name}".`, "info");
  }

  function saveCurrentScenario(): void {
    if (!calculation.result.ok) {
      pushStatus("Cannot save until salary inputs are valid.", "warning");
      return;
    }

    const now = Date.now();
    if (activeScenarioId) {
      const savedName = createUniqueScenarioName(scenarioName, scenarios, activeScenarioId);
      setScenarios((prev) =>
        prev.map((scenario) =>
          scenario.id === activeScenarioId
            ? { ...scenario, name: savedName, form, updatedAt: now }
            : scenario
        )
      );
      setScenarioName(savedName);
      pushStatus(`Scenario "${savedName}" updated.`, "success");
      return;
    }

    const savedName = createUniqueScenarioName(scenarioName, scenarios);
    const newScenario: SavedSalaryScenario = {
      id: createSalaryScenarioId(),
      name: savedName,
      pinned: false,
      compare: false,
      createdAt: now,
      updatedAt: now,
      form
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

    const now = Date.now();
    const duplicateName = createUniqueScenarioName(source.name, scenarios);
    const duplicate: SavedSalaryScenario = {
      ...source,
      id: createSalaryScenarioId(),
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
      setScenarioName("Salary Scenario");
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

    if (!candidate.compare) {
      const selectedCount = scenarios.filter((scenario) => scenario.compare).length;
      if (selectedCount >= MAX_COMPARE_SCENARIOS) {
        pushStatus(`You can compare up to ${MAX_COMPARE_SCENARIOS} salary scenarios.`, "warning");
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
        <p className="eyebrow">Salary Planner</p>
        <h1>Model take-home pay for salary offers</h1>
        <p className="subtitle">
          Use one focused salary workspace to compare states, 401(k) settings, and net income side by side.
        </p>
        <Link href="/" className="back-link">
          Back to home
        </Link>
      </section>

      <section className="workspace">
        <article className="panel form-panel reveal">
          <h2>Inputs</h2>
          <section className="context-panel">
            <div className="context-grid">
              <div className="context-item">
                <span className="context-label">Route</span>
                <strong className="context-value">Salary planner</strong>
              </div>
              <div className="context-item">
                <span className="context-label">Planning profile</span>
                <strong className="context-value">Single filer</strong>
              </div>
              <div className="context-item">
                <span className="context-label">FICA treatment</span>
                <strong className="context-value">FICA exempt</strong>
              </div>
              <div className="context-item">
                <span className="context-label">Pay cadence</span>
                <strong className="context-value">Bi-weekly</strong>
              </div>
            </div>
            <p className="context-note">
              This salary flow is intentionally slimmed down for your personal planning setup, so fixed
              assumptions are shown once instead of repeated as disabled fields.
            </p>
          </section>

          <div className="field-grid two-col">
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

            <label>
              401(k) percentage (optional)
              <input
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={form.contribution401kPercent}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    contribution401kPercent: clampPercent(parseNumber(event.target.value))
                  }))
                }
              />
            </label>

          </div>

          <p className="input-hint">
            401(k) is treated as a pre-tax payroll contribution. Gross monthly income uses annual salary divided
            by 12.
          </p>

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
              <p className="pill warning">You have unsaved changes in the active salary scenario.</p>
            ) : null}

            <div className="scenario-list-wrap">
              <h4>Saved salary scenarios</h4>
              {isHydrated && scenarioViews.length === 0 ? (
                <p className="empty-state">No saved salary scenarios yet. Save one to compare later.</p>
              ) : (
                <ul className="scenario-list">
                  {scenarioViews.map((view) => {
                    const isActive = view.scenario.id === activeScenarioId;
                    const monthlyLabel = view.calculation.ok
                      ? currencyFormatter.format(view.calculation.summary.netMonthlyIncome)
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
                          Salary · {view.scenario.form.stateCode} · {view.scenario.form.taxYear}
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
            Table version: <strong>{calculation.tableVersion}</strong> · Year: <strong>{form.taxYear}</strong> ·
            Updated: <strong>{generatedAtLabel}</strong>
          </p>
          <p className="meta-row">
            State: <strong>{selectedStateLabel}</strong> · Scope: <strong>{selectedStateScopeLabel}</strong> ·
            Filing status: <strong>Single</strong> · FICA: <strong>Exempt</strong> · Frequency:{" "}
            <strong>Bi-weekly</strong>
          </p>

          {!isHydrated ? <p className="pill info">Loading saved salary scenarios...</p> : null}
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
          <p className="input-hint">
            Disclaimer: this salary view assumes no FICA withholding because you are on an F-1 visa.
          </p>

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

          {summary ? (
            <div className="stat-grid">
              <div className="stat-card emphasis">
                <span>Net annual income</span>
                <strong>{currencyFormatter.format(summary.netAnnualIncome)}</strong>
              </div>
              <div className="stat-card">
                <span>Gross monthly income</span>
                <strong>{currencyFormatter.format(summary.grossMonthlyIncome)}</strong>
              </div>
              <div className="stat-card">
                <span>Gross bi-weekly income</span>
                <strong>{currencyFormatter.format(summary.grossBiweeklyIncome)}</strong>
              </div>
              <div className="stat-card">
                <span>Net monthly income</span>
                <strong>{currencyFormatter.format(summary.netMonthlyIncome)}</strong>
              </div>
              <div className="stat-card">
                <span>Net bi-weekly income</span>
                <strong>{currencyFormatter.format(summary.netBiweeklyIncome)}</strong>
              </div>
              <div className="stat-card">
                <span>Effective hourly income (40 hrs/week)</span>
                <strong>{currencyFormatter.format(summary.effectiveHourlyIncome)}</strong>
              </div>
              <div className="stat-card">
                <span>401(k) annual contribution</span>
                <strong>{currencyFormatter.format(summary.annual401kContribution)}</strong>
              </div>
              <div className="stat-card">
                <span>Total taxes</span>
                <strong>{currencyFormatter.format(summary.totalTax)}</strong>
              </div>
              <div className="stat-card">
                <span>Total tax percentage</span>
                <strong>{percentFormatter.format(summary.totalTaxPercentage)}</strong>
              </div>
            </div>
          ) : (
            <div className="stat-grid">
              <div className="stat-card">
                <span>Status</span>
                <strong>Waiting for valid salary inputs</strong>
              </div>
            </div>
          )}

          {summary ? (
            <div className="breakdown">
              <h3>Compensation breakdown</h3>
              <div className="line-item rich">
                <div>
                  <span>Gross annual salary</span>
                  <p className="line-subtext">Base salary input used for annual earnings.</p>
                </div>
                <strong>{currencyFormatter.format(summary.grossAnnualIncome)}</strong>
              </div>
              <div className="line-item rich">
                <div>
                  <span>401(k) contribution</span>
                  <p className="line-subtext">
                    {percentFormatter.format(form.contribution401kPercent / 100)} of gross salary
                  </p>
                </div>
                <strong>{currencyFormatter.format(summary.annual401kContribution)}</strong>
              </div>
              <h3>Tax breakdown</h3>
              <div className="line-item rich">
                <div>
                  <span>Federal income tax</span>
                  <p className="line-subtext">{percentFormatter.format(federalRateOfGross)} of gross income</p>
                </div>
                <strong>{currencyFormatter.format(summary.federalTax)}</strong>
              </div>
              <div className="line-item rich">
                <div>
                  <span>State income tax</span>
                  <p className="line-subtext">{percentFormatter.format(stateRateOfGross)} of gross income</p>
                </div>
                <strong>{currencyFormatter.format(summary.stateTax)}</strong>
              </div>
              <div className="line-item rich">
                <div>
                  <span>Total bi-weekly taxes</span>
                  <p className="line-subtext">Based on a fixed 26-paycheck year.</p>
                </div>
                <strong>{currencyFormatter.format(summary.totalBiweeklyTax)}</strong>
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
                  <option value="effectiveHourlyIncome">Best effective hourly income</option>
                  <option value="totalTax">Lowest total tax</option>
                </select>
              </label>
              <p className="compare-count">
                {compareViews.length}/{MAX_COMPARE_SCENARIOS} selected
              </p>
            </div>

            {compareViews.length === 0 ? (
              <p className="empty-state">Select salary scenarios in the list to start comparing.</p>
            ) : null}
            {compareViews.length === 1 ? (
              <p className="empty-state">Select one more salary scenario to unlock side-by-side comparison.</p>
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
                          ["effectiveHourlyIncome", "Effective hourly income"],
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
                      className={`compare-card ${bestScenarioId === view.scenario.id ? "best-col" : ""}`}
                    >
                      <h4 title={view.scenario.name}>{view.scenario.name}</h4>
                      <p>
                        Net monthly: <strong>{formatCompareValue(view, "netMonthly")}</strong>
                      </p>
                      <p>
                        Net annual: <strong>{formatCompareValue(view, "netAnnual")}</strong>
                      </p>
                      <p>
                        Effective hourly income:{" "}
                        <strong>{formatCompareValue(view, "effectiveHourlyIncome")}</strong>
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

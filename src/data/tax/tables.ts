import federal2026Raw from "@/data/tax/2026/federal.json";
import az2026Raw from "@/data/tax/2026/states/AZ.json";
import ca2026Raw from "@/data/tax/2026/states/CA.json";
import fl2026Raw from "@/data/tax/2026/states/FL.json";
import ga2026Raw from "@/data/tax/2026/states/GA.json";
import il2026Raw from "@/data/tax/2026/states/IL.json";
import nc2026Raw from "@/data/tax/2026/states/NC.json";
import ny2026Raw from "@/data/tax/2026/states/NY.json";
import pa2026Raw from "@/data/tax/2026/states/PA.json";
import tx2026Raw from "@/data/tax/2026/states/TX.json";
import wa2026Raw from "@/data/tax/2026/states/WA.json";
import metadata2026Raw from "@/data/tax/2026/metadata.json";
import { isFederalTaxTable, isStateTaxTable } from "@/src/domain/tax/schema";
import type { CalculationTables, FederalTaxTable, StateTaxTable } from "@/src/domain/tax/types";

export interface StateOption {
  code: string;
  label: string;
}

export interface TaxTableSource {
  scope: string;
  label: string;
  url: string;
}

export interface TaxYearMetadata {
  taxYear: number;
  tableVersion: string;
  generatedAt?: string;
  notes?: string;
  sources: TaxTableSource[];
  isKnown: boolean;
}

interface TaxYearConfig {
  federal: FederalTaxTable;
  states: Record<string, StateTaxTable>;
  metadata: TaxYearMetadata;
}

function isTaxTableSource(value: unknown): value is TaxTableSource {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.scope === "string" &&
    typeof candidate.label === "string" &&
    typeof candidate.url === "string"
  );
}

if (!isFederalTaxTable(federal2026Raw)) {
  throw new Error("Invalid 2026 federal tax table.");
}

const stateTableCandidates: Record<string, unknown> = {
  AZ: az2026Raw,
  CA: ca2026Raw,
  NC: nc2026Raw,
  TX: tx2026Raw,
  NY: ny2026Raw,
  PA: pa2026Raw,
  IL: il2026Raw,
  WA: wa2026Raw,
  GA: ga2026Raw,
  FL: fl2026Raw
};

const stateTables2026: Record<string, StateTaxTable> = {};
for (const [code, candidate] of Object.entries(stateTableCandidates)) {
  if (!isStateTaxTable(candidate)) {
    throw new Error(`Invalid 2026 state tax table: ${code}`);
  }
  stateTables2026[code] = candidate;
}

const tableVersion2026 =
  typeof metadata2026Raw.tableVersion === "string" ? metadata2026Raw.tableVersion : "unknown";
const metadata2026: TaxYearMetadata = {
  taxYear: 2026,
  tableVersion: tableVersion2026,
  sources: Array.isArray(metadata2026Raw.sources)
    ? metadata2026Raw.sources.filter(isTaxTableSource)
    : [],
  isKnown: true
};
if (typeof metadata2026Raw.generatedAt === "string") {
  metadata2026.generatedAt = metadata2026Raw.generatedAt;
}
if (typeof metadata2026Raw.notes === "string") {
  metadata2026.notes = metadata2026Raw.notes;
}

const TAX_TABLES_BY_YEAR: Record<number, TaxYearConfig> = {
  2026: {
    federal: federal2026Raw,
    states: stateTables2026,
    metadata: metadata2026
  }
};

export const AVAILABLE_TAX_YEARS = Object.keys(TAX_TABLES_BY_YEAR)
  .map(Number)
  .sort((a, b) => b - a);

const STATE_LABELS: Record<string, string> = {
  AZ: "Arizona",
  CA: "California",
  NC: "North Carolina",
  TX: "Texas",
  NY: "New York",
  PA: "Philadelphia",
  IL: "Illinois",
  WA: "Washington",
  GA: "Atlanta",
  FL: "Florida"
};

export function getStateOptionsForYear(taxYear: number): StateOption[] {
  const config = TAX_TABLES_BY_YEAR[taxYear];
  if (!config) {
    return [];
  }
  return Object.keys(config.states).map((code) => ({
    code,
    label: STATE_LABELS[code] ?? code
  }));
}

export function getTableVersion(taxYear: number): string {
  return TAX_TABLES_BY_YEAR[taxYear]?.metadata.tableVersion ?? "unknown";
}

export function getTaxYearMetadata(taxYear: number): TaxYearMetadata {
  const config = TAX_TABLES_BY_YEAR[taxYear];
  if (!config) {
    return {
      taxYear,
      tableVersion: "unknown",
      sources: [],
      isKnown: false
    };
  }
  return config.metadata;
}

export function getCalculationTables(
  taxYear: number,
  stateCode: string
): CalculationTables | null {
  const config = TAX_TABLES_BY_YEAR[taxYear];
  if (!config) {
    return null;
  }
  const state = config.states[stateCode];
  if (!state) {
    return null;
  }
  return {
    federal: config.federal,
    state
  };
}

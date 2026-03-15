import type { FederalTaxTable, ProgressiveBracket, StateTaxTable } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isValidBracket(value: unknown): value is ProgressiveBracket {
  if (!isRecord(value)) {
    return false;
  }
  const rate = value.rate;
  const upTo = value.upTo;
  const upToValid = upTo === null || (typeof upTo === "number" && upTo >= 0);
  return typeof rate === "number" && rate >= 0 && rate <= 1 && upToValid;
}

export function isFederalTaxTable(value: unknown): value is FederalTaxTable {
  if (!isRecord(value)) {
    return false;
  }
  const deductions = value.standardDeductionByStatus;
  const brackets = value.bracketsByStatus;
  if (!isRecord(deductions) || !isRecord(brackets)) {
    return false;
  }
  for (const status of ["single", "married_joint"]) {
    if (typeof deductions[status] !== "number") {
      return false;
    }
    const candidate = brackets[status];
    if (!Array.isArray(candidate) || candidate.length === 0) {
      return false;
    }
    if (!candidate.every(isValidBracket)) {
      return false;
    }
  }
  return true;
}

export function isStateTaxTable(value: unknown): value is StateTaxTable {
  if (!isRecord(value)) {
    return false;
  }
  if (typeof value.stateCode !== "string") {
    return false;
  }
  if (value.taxType === "none") {
    return true;
  }
  if (value.taxType === "flat") {
    return typeof value.flatRate === "number";
  }
  if (value.taxType === "progressive") {
    if (!isRecord(value.bracketsByStatus)) {
      return false;
    }
    const singles = value.bracketsByStatus.single;
    const married = value.bracketsByStatus.married_joint;
    const singleOk =
      singles === undefined || (Array.isArray(singles) && singles.every(isValidBracket));
    const marriedOk =
      married === undefined || (Array.isArray(married) && married.every(isValidBracket));
    return singleOk && marriedOk;
  }
  return false;
}

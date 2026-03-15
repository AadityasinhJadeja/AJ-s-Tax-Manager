# PRD: US Take-Home Pay Calculator (Personal Use)

Document owner: AJ 
Primary audience: Tech Lead, Product Designer, Memory Captain  
Version: 1.3  
Status: Approved for focused-jurisdiction data handoff  
Last updated: 2026-03-15 (America/Los_Angeles)  

## 1. Product Overview

### 1.1 One-line summary
A personal calculator that starts with a mandatory mode choice (`Hourly` or `Salaried`) and then estimates federal + state + FICA-aware take-home pay in isolated flows.

### 1.2 Problem statement
As an international student in the U.S., I repeatedly do manual tax and take-home calculations across states, pay types, and compensation scenarios, which is slow, error-prone, and painful during offer evaluation and planning.

### 1.3 Why this matters now
- Current workflow causes repeated back-and-forth and context switching.
- Compensation decisions require quick state-by-state comparison.
- The same logic is re-run often, especially for hourly part-time planning.

### 1.4 Product goal
Reduce compensation-comparison effort from manual multi-step research to a fast, repeatable, transparent workflow in one tool.

## 2. Users, Segments, and Context

### 2.1 Primary user
Single user (owner): international student from India living in the U.S., currently part-time hourly, likely transitioning to full-time salary.

### 2.2 Secondary users (future, optional)
None in MVP. Product is private/personal.

### 2.3 Core scenarios
1. **Entry and routing (all sessions):**  
   Land on `/` -> choose `Hourly` or `Salaried` -> route to dedicated workspace.
2. **Part-time hourly (high frequency):**  
   Enter hourly rate + weekly hours + state + duration (`Total weeks` or `Date range`) -> get total and bi-weekly take-home estimate.
3. **Full-time salary (lower frequency):**  
   Enter annual salary + state -> get monthly and annual take-home estimate.
4. **Offer comparison (decision flow):**  
   Save/duplicate scenarios and compare take-home across states and compensation inputs.

## 3. Facts, Assumptions, and Hypotheses

### 3.1 Facts
- User needs both hourly and annual workflows.
- User needs federal and state tax estimation and take-home outputs.
- User wants faster, repeatable calculation without depending on ad-hoc chat.
- Hourly workflow only needs a focused set of jurisdictions for MVP, not 50-state coverage.

### 3.2 Assumptions
- User often needs estimate-level accuracy for planning, not filing-ready tax returns.
- For this personal build, assumptions are hard-coded: `Single`, `FICA Exempt`, `Bi-weekly`.
- Local city/county taxes are not mandatory for MVP.
- User-provided city names in the selector are treated as state-level tax proxies for MVP:
  - `Philadelphia` -> Pennsylvania (`PA`)
  - `Atlanta` -> Georgia (`GA`)

### 3.3 Hypotheses
- If we provide transparent breakdown + assumptions + side-by-side comparison, trust and usability will be high enough for daily decision-making.
- Hourly mode will be used more frequently than salary mode in near term.

## 4. Scope

### 4.1 In-scope (MVP)
- Dedicated gateway entry at `/`:
  - exactly two actions: `Hourly`, `Salaried`
  - no mixed calculator UI on home
- Route-level flow separation:
  - `/hourly` for hourly workflow
  - `/salary` for salary workflow
- Focused hourly jurisdiction coverage (MVP):
  - `California (CA)`
  - `North Carolina (NC)`
  - `Texas (TX)`
  - `New York (NY)`
  - `Philadelphia (PA proxy label)`
  - `Illinois (IL)`
  - `Washington (WA)`
  - `Arizona (AZ)`
  - `Atlanta (GA proxy label)`
  - `Florida (FL)`
- Tax estimation outputs:
  - Federal income tax estimate
  - State income tax estimate
  - FICA (Social Security + Medicare) with fixed exemption assumption
- Net outputs:
  - Gross income (total period)
  - Net income (total period)
  - Net bi-weekly
  - Total taxes
  - Total bi-weekly taxes
  - Tax breakdown with percentages
  - Total tax percentage
  - Net monthly (reference)
  - Effective net hourly (for comparability)
- Scenario management:
  - Create
  - Duplicate
  - Edit
  - Compare (2-4 scenarios side-by-side)
- Tax-year selection and visible data version/last-updated indicator.

### 4.2 Out-of-scope (MVP non-goals)
- Homepage state/federal tax reference table.
- 50-state coverage in hourly mode.
- Tax filing optimization and return preparation.
- Advanced credits/deductions optimization (AOTC, EITC, itemization strategy, etc.).
- City/local taxes at launch.
- Public multi-user features, auth, billing, sharing.
- AI chat/copilot layer.

### 4.3 Cut List (explicit)
- Remove generic “all tax edge cases” logic.
- Remove employer-benefit simulation complexity beyond simple pre-tax deductions input.
- Remove “what-if” Monte Carlo/investment forecasting.
- Remove payroll-provider exact withholding parity as hard requirement.
- Remove informational tax-rate table from homepage for v1.

## 5. Workflow and Friction Map

### 5.1 Current workflow (pain)
Trigger -> receive hourly/salary info -> search tax rates -> calculate federal -> calculate state -> estimate total-period + bi-weekly impact -> repeat for another state -> compare manually.

### 5.2 Bad friction to remove
- Re-entering similar data repeatedly.
- Switching between many tabs/tools.
- No consistent assumptions between calculations.
- No stable way to compare scenarios quickly.
- Mixed mode controls in one calculator surface causing accidental context switching.

### 5.3 Good friction to keep
- Explicit assumptions panel (tax year, fixed hard-coded assumptions, deductions).
- Transparent formula breakdown for trust.
- “Estimate only” compliance wording.

## 6. Functional Requirements

### 6.0 Entry and navigation
- `/` is a chooser page with exactly two options:
  - `Hourly`
  - `Salaried`
- Clicking one option routes to the corresponding dedicated page.
- Hourly and salaried UI/forms are isolated at page level so mode-specific logic does not contradict.

### 6.1 Inputs
- **Common**
  - Tax year
  - State/jurisdiction (hourly list constrained to the focused 10 labels)
  - Pre-tax deductions (simple annual amount, optional)
- **Hard-coded assumptions (personal use)**
  - Filing status: `Single`
  - FICA mode: `Exempt`
  - Pay frequency: `Bi-weekly`
- **Hourly mode**
  - Hourly rate
  - Average hours/week
  - Duration input mode:
    - `Total weeks`
    - `Date range` (`Start date`, `End date`, optional `Final partial week hours`)
- **Salary mode**
  - Annual base salary

### 6.2 Outputs
- Gross income (total period).
- Estimated federal income tax.
- Estimated state income tax.
- Estimated FICA tax (zero in current hard-coded mode).
- Total estimated tax.
- Net income (total period).
- Net monthly take-home.
- Net bi-weekly take-home.
- Total bi-weekly taxes.
- Tax-line percentages:
  - each line as % of gross
  - effective tax rate on each line's taxable base
- Total tax percentage and effective net hourly.
- Hourly quick-rate callouts:
  - Selected state tax rate (%)
  - Selected federal tax rate (%)

### 6.3 Scenario operations
- Save scenario with user-defined name.
- Duplicate scenario.
- Bulk compare selected scenarios.
- Sort comparisons by net monthly or net annual.

### 6.4 Transparency and trust
- Show calculation assumptions used.
- Show tax data version/year.
- Show “estimate, not tax/legal advice.”
- Provide formula-level expandable breakdown.

## 7. Data and Rules Requirements

### 7.1 Data model requirements
- Versioned tax tables by tax year.
- Federal tables:
  - Brackets and rates by filing status
  - Standard deduction values
- State tables (focused MVP jurisdictions):
  - `CA`, `NC`, `TX`, `NY`, `PA`, `IL`, `WA`, `AZ`, `GA`, `FL`
  - None / flat / progressive structure
  - Brackets/rates where applicable
  - Basic standard deduction/personal exemption support where relevant
- FICA config:
  - Default rates in config
  - Exemption override supported in engine, fixed to exempt in current UI

### 7.2 Data source policy
- Prefer official primary sources (IRS + state department of revenue/taxation).
- Maintain citation metadata internally for each table/version.
- Annual update workflow required before each new tax year usage.

### 7.3 Rule boundaries
- MVP results are planning estimates, not payroll-exact withholding.
- If state rule is incomplete/unavailable, block final estimate and show clear warning.
- `Philadelphia` and `Atlanta` selector labels map to state-level tax estimates (`PA`/`GA`) in MVP; local city taxes are excluded.

## 8. Non-Functional Requirements

- Fast interaction: updated results within 300 ms for normal input edits.
- Deterministic outputs for same inputs + same table version.
- Traceable calculations (debuggable and inspectable).
- Private-first data handling (local or private storage).
- Simple backup/export of scenario data (CSV/JSON acceptable for MVP+1).

## 9. UX/Product Principles

- “Compare first” experience over “single calculator” experience.
- Minimize input burden through sensible defaults.
- Keep a two-step flow: explicit mode selection first, then mode-specific workspace.
- Separate hourly and salary entry clearly to avoid confusion.
- Show confidence cues: assumptions, source year, caveats.

## 10. Success Metrics

### 10.1 Primary success metrics
- Time to compute one scenario: < 60 seconds.
- Time to compare 3 states/offers: < 3 minutes.
- Manual recalculation frequency drops by 70%+ in first month.

### 10.2 Quality metrics
- 100% deterministic repeat output with same inputs.
- 0 silent failures (all missing-data cases surfaced to user).

### 10.3 Adoption metric (personal product)
- Tool used for 80%+ of compensation/tax estimation decisions over 30 days.

## 11. Risks and Mitigations

### 11.1 Data freshness risk
- **Risk:** outdated federal/state tables produce wrong estimates.
- **Mitigation:** tax-year versioning, visible “last updated,” annual update checklist.

### 11.2 FICA correctness risk
- **Risk:** exemption applicability depends on personal status and residency rules.
- **Mitigation:** hard-coded exempt assumption is visible in warning/assumptions UI; toggle can be re-enabled later if needed.

### 11.3 Scope creep risk
- **Risk:** adding filing-level complexity early slows delivery.
- **Mitigation:** enforce MVP cut list and defer advanced tax logic.

## 12. Release Plan

### 12.1 MVP Release (v1)
- Mode-selection gateway on `/` with dedicated route split (`/hourly`, `/salary`).
- Dual-mode calculator capability through isolated hourly + salary workspaces.
- Federal + state + FICA-aware engine.
- Focused hourly jurisdiction support for CA, NC, TX, NY, PA(label: Philadelphia), IL, WA, AZ, GA(label: Atlanta), FL.
- Scenario save/duplicate/compare.
- Tax-year versioning and assumptions display.

### 12.2 Post-MVP candidates (v1.1+)
- City/local taxes for selected cities.
- More filing statuses and deduction controls.
- Re-enable editable FICA and pay-frequency controls if product expands beyond single-user personal use.
- Import/export and historical scenario timeline.
- Sensitivity view (hours/week band, salary negotiation deltas).

## 13. CPO Screen

### 13.1 Desirability
High. Solves repeated high-friction personal pain with frequent use.

### 13.2 Viability
High for personal/internal use. No revenue/distribution constraints for MVP.

### 13.3 Feasibility
High. Deterministic calculator with manageable data modeling complexity.

### 13.4 Distribution/adoption risk
Low. Single-user tool with clear immediate value.

### 13.5 Compliance/legal risk
Medium if framed as tax advice; low if clearly positioned as estimate/planning tool with disclaimers.

## 14. Handoff Requirements

### 14.1 For Tech Lead
- Define deterministic tax engine boundaries and calculation contract.
- Preserve current hourly behavior during route split; no hourly formula regressions.
- Define clean folder boundaries for hourly/salaried/shared code paths.
- Propose tax table schema + yearly update pipeline.
- Implement and validate the focused hourly jurisdiction table set:
  - CA, NC, TX, NY, PA, IL, WA, AZ, GA, FL
- Implement selector label mapping for city aliases:
  - Philadelphia -> PA
  - Atlanta -> GA
- Specify test strategy:
  - Golden test vectors per state/type/year
  - Regression suite for calculation parity
- Lock architecture that supports versioned data and traceable outputs.

### 14.2 For Product Designer
- Design a dual-mode input experience that prevents mode confusion.
- Prioritize scenario comparison as a first-class workflow.
- Include assumptions and calculation transparency UI.
- Design trust states:
  - Loading
  - Missing data
  - Partial estimate warning
  - Fixed-assumptions state

### 14.3 For Memory Captain
- Track immutable product decisions from this PRD.
- Keep one active implementation milestone at a time.
- Capture only major PRD changes (not minor copy/label tweaks).
- Maintain a strict change log with rationale and date.

## 15. Open Questions (To Resolve Before Build Freeze)

1. Should overtime be included in hourly mode at launch?
2. Is local storage sufficient, or do we need cloud persistence from day one?
3. Should Philadelphia/Atlanta remain state-only proxies in MVP, or include local city taxes in v1.1?

## 16. Decision

Go for MVP build under this PRD with strict scope control.  
Any change that impacts calculation contract, trust model, or scenario workflow is a **major PRD change** and requires explicit update.

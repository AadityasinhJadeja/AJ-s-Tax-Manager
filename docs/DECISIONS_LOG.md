# DECISIONS_LOG

- Date: 2026-03-15
- Decision: Slice 6 route split is accepted as verified with gateway navigation, isolated `/hourly` and `/salary` routes, and visible back-to-home controls in both flows.
- Why: manual smoke checks and build gates confirm routing clarity and mode isolation without formula regressions.
- Replaced rule: prior state with Slice 6 in-progress.
- Owner: tech-lead

- Date: 2026-03-15
- Decision: Slice 7 focused hourly data coverage is accepted as verified; active state options are restricted to the approved 10-jurisdiction list and metadata now includes per-state official source links.
- Why: this closes the scoped data-contract gap while preserving MVP simplicity and trust transparency.
- Replaced rule: prior state with Slice 7 pending.
- Owner: tech-lead

- Date: 2026-03-15
- Decision: Deployment (Slice 5) is intentionally deferred as the final step after route-split completion and pre-deploy trust hardening.
- Why: this reduces risk of shipping avoidable UX/trust regressions and keeps release quality aligned with product credibility goals.
- Replaced rule: prior execution order with deploy as active immediate slice.
- Owner: cpo

- Date: 2026-03-15
- Decision: Hourly tax coverage is now explicitly limited to a focused 10-jurisdiction MVP list: CA, NC, TX, NY, PA(label: Philadelphia), IL, WA, AZ, GA(label: Atlanta), FL.
- Why: this aligns scope to real usage, reduces data-maintenance overhead, and removes unnecessary 50-state complexity for a single-user product.
- Replaced rule: prior implicit/legacy assumption of broad or all-state hourly coverage.
- Owner: cpo

- Date: 2026-03-15
- Decision: `Philadelphia` and `Atlanta` are treated as state-level selector aliases (`PA`, `GA`) for MVP; local city taxes remain deferred.
- Why: preserves the requested UX labels while keeping data and engine logic state-based and deterministic.
- Replaced rule: none (new clarification decision).
- Owner: cpo

- Date: 2026-03-15
- Decision: The app entry at `/` is now a mandatory mode-selection gateway with exactly two choices: `Hourly` and `Salaried`. Users continue only after choosing one mode.
- Why: this adds good friction up front to prevent mode-mixing errors, improves clarity for future contributors, and keeps each calculation flow isolated.
- Replaced rule: prior default behavior loading a mixed dual-mode calculator directly on home.
- Owner: cpo

- Date: 2026-03-15
- Decision: Hourly and salaried flows must be implemented as separate route-level modules with clean folder boundaries; existing hourly calculation behavior is preserved as-is during split.
- Why: protects trusted hourly logic while enabling independent salary evolution without cross-flow contradictions.
- Replaced rule: prior shared in-page mode switching inside one large calculator surface.
- Owner: cpo

- Date: 2026-03-15
- Decision: The homepage tax-rate reference table idea is explicitly deferred from MVP.
- Why: informational table adds scope and maintenance overhead without directly reducing the primary workflow friction.
- Replaced rule: none (new scope-cut decision).
- Owner: cpo

- Date: 2026-03-15
- Decision: Hourly flow is now contract-duration based with two duration entry modes: `Total weeks` or `Date range` (with optional final partial-week hours override), and outputs are centered on total-period + bi-weekly metrics.
- Why: personal workflow frequently has known start/end dates but unknown exact week count; the new model removes input friction while preserving deterministic calculations.
- Replaced rule: prior hourly input model requiring only `weeksPerYear` and annual/monthly-first output emphasis.
- Owner: cpo

- Date: 2026-03-15
- Decision: For this personal build, filing status, FICA mode, and pay frequency are hard-coded to `single`, `exempt`, and `biweekly`.
- Why: single-user product constraint; fixed assumptions reduce UI noise and speed data entry.
- Replaced rule: prior configurable controls for filing status, FICA mode, and pay frequency.
- Owner: cpo

- Date: 2026-03-14
- Decision: MVP compute path is client-side deterministic logic with no required backend API for tax calculations.
- Why: lowest complexity and operational overhead for personal single-user MVP; faster iteration and deterministic behavior.
- Replaced rule: none (initial architecture decision).
- Owner: tech-lead

- Date: 2026-03-14
- Decision: Execution order is slice-based; only Slice 0 and Slice 1 should be active before design polish/features.
- Why: protect MVP timeline and avoid scope creep before engine correctness.
- Replaced rule: any implied parallel work across later slices before engine stabilization.
- Owner: tech-lead

- Date: 2026-03-14
- Decision: Memory sync now tracks Slice 0 as partially complete based on existing TypeScript + domain contract files, with no product-code refactor performed.
- Why: keep continuity accurate while avoiding unnecessary churn in active implementation work.
- Replaced rule: previous context line claiming planning-doc-only repository state.
- Owner: memorycaptain

- Date: 2026-03-14
- Decision: Task state advanced to `Slice 1 In Progress` because tax engine implementation and tests already exist; active gate is now restoring green typecheck.
- Why: execution memory must reflect actual working state to avoid duplicate or conflicting handoffs.
- Replaced rule: prior task state keeping Slice 0 as the active task.
- Owner: memorycaptain

- Date: 2026-03-14
- Decision: Canonical enduring product documentation lives in `docs/`, with `PRD.md` as the source of truth and `DECISIONS_LOG.md` as the durable change record.
- Why: align documentation to the smallest set that remains useful after implementation and reduce handoff-document sprawl.
- Replaced rule: mixed root-level vs docs-level documentation references.
- Owner: memorycaptain

- Date: 2026-03-14
- Decision: Slice 1 is considered verified (typecheck + test + build green) and active task moved to Slice 2.
- Why: implementation and verification gates are already satisfied for Slice 1; execution should now progress without reopening completed slices.
- Replaced rule: prior execution state with Slice 1 as active.
- Owner: memorycaptain

- Date: 2026-03-14
- Decision: Slice 2 is completed with a Next.js App Router UI shell wired to the deterministic tax engine; active task moves to Slice 3.
- Why: dual-mode UI, assumptions panel, summary cards, and trust states are implemented and green-gated (`typecheck`, `test`, `build`).
- Replaced rule: prior execution state with Slice 2 as active.
- Owner: tech-lead

- Date: 2026-03-14
- Decision: Product design direction for Slice 3 is locked as Calm Ledger with explicit token, component, motion, and accessibility contracts.
- Why: prevent generic UI output and reduce implementation churn before scenario persistence/comparison build.
- Replaced rule: open visual direction for Slice 3.
- Owner: product-designer

- Date: 2026-03-14
- Decision: Slice 3 is completed with localStorage scenario persistence and a 2-4 scenario comparison board; active task moves to Slice 4 hardening.
- Why: required scenario operations (save/duplicate/delete/pin/compare) and comparison views are implemented and green-gated (`typecheck`, `test`, `build`).
- Replaced rule: prior execution state with Slice 3 as active.
- Owner: tech-lead

- Date: 2026-03-15
- Decision: Slice 4 is completed with tax-year metadata visibility and warning-state hardening; active task moves to Slice 5 deployment checks.
- Why: warning center now provides actionable/expandable guidance, data provenance links, and stale/unknown table signaling with green gates passing.
- Replaced rule: prior execution state with Slice 4 as active.
- Owner: tech-lead

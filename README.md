# AJ Tax Manager

AJ Tax Manager is a personal take-home pay planner for U.S. hourly and salaried income.

## Why this exists

I built this because I was repeating the same manual tax math every time I wanted to compare pay options across states. It was slow, easy to mess up, and hard to trust.  
This project turns that process into one focused workflow with clear assumptions and transparent outputs.

## What this product does

- Starts with a mode choice at `/`: `Hourly` or `Salaried`
- Routes into separate planning flows so inputs stay clean and focused
- Estimates federal, state, and FICA-aware take-home values
- Shows practical outputs like net total, net monthly, net bi-weekly, and tax breakdown percentages
- Supports saved scenarios with duplicate and compare behavior for faster decision making
- Uses focused hourly coverage for MVP: `CA`, `NC`, `TX`, `NY`, `PA`, `IL`, `WA`, `AZ`, `GA`, `FL`

## Product status

- Stage: MVP (personal use)
- Core calculator engine: complete
- Route split (`/hourly`, `/salary`): complete
- Focused hourly tax data coverage: complete
- Deployment: intentionally done after trust/readiness checks

## Tech stack

- Next.js (App Router)
- React
- TypeScript
- Vitest
- Local versioned tax data files under `data/tax/<year>/`

## Quick start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

- `npm run dev` - start local dev server
- `npm run build` - production build
- `npm run start` - run production build locally
- `npm run typecheck` - TypeScript checks
- `npm run test` - run tests once
- `npm run test:watch` - run tests in watch mode

## Project structure

```text
app/                  Next.js routes and pages
src/domain/tax/       Deterministic tax engine and contracts
src/features/         Hourly and salary feature pages
src/state/            Scenario and persistence state
src/data/tax/         Tax table loading utilities
data/tax/             Versioned tax data files
docs/                 PRD
```

## Important note

This tool provides planning estimates, not tax or legal advice.

## Documentation

- Product requirements: `docs/PRD.md`

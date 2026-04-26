# Frontend

Next.js 15 (Pages Router), TypeScript, Tailwind CSS v3. Single page app — all logic lives in `pages/index.tsx`.

See [`docs/dev-best-practices.md`](dev-best-practices.md) for frontend conventions (API call patterns, type management, dark mode, form fields).

## Commands (run from `frontend/`)

```bash
npm run dev      # dev server → http://127.0.0.1:3000
npm run build    # production build
npm run lint     # ESLint
```

## Environment

Create `frontend/.env.local`:
```
NEXT_PUBLIC_API_URL=http://127.0.0.1:5000/api
```

## Architecture

All API calls go through `services/api.ts` (axios wrapper). Shared TypeScript types live in `types/index.ts`. Do not call the API directly from components.

State is managed locally in `pages/index.tsx` via `useState`/`useEffect`. Filters are passed as query params to the backend — no client-side filtering.

The app has two top-level views — **Budget** and **Debt Analysis** — switched via a pill toggle in `pages/index.tsx` (`activeView` state). Budget view is the original app; Debt Analysis renders `DebtDashboard`.

### UI state persistence

`activeView` and `activeTab` are persisted to `localStorage` and restored after hydration via a mount `useEffect`, so the app returns to the last-visited view/tab on refresh. State initializes with defaults (matching SSR to avoid hydration errors), then restores from `localStorage` client-side. `localStorage` writes happen in `handleSetActiveView`/`handleSetActiveTab` — not in effects — to avoid overwriting saved values with defaults during the initial render cycle. Filter state and pagination reset on refresh intentionally.

### Key files

| Path | Purpose |
|---|---|
| `pages/index.tsx` | Main page — top-level view switcher (`budget`/`debt`), all budget state, data loading |
| `pages/_app.tsx` | App shell — wraps with `ThemeProvider` |
| `services/api.ts` | Axios instance + all API methods (budget and debt) |
| `types/index.ts` | Shared TypeScript interfaces (budget and debt types) |
| `lib/ThemeContext.tsx` | Dark/light theme context, persists to `localStorage`, falls back to `prefers-color-scheme` |
| `components/ThemeToggle.tsx` | Slide toggle UI — reads/writes via `useTheme()` |

### Budget components

| Component | Purpose |
|---|---|
| `FileUpload.tsx` | Drag-and-drop CSV upload via `react-dropzone` |
| `TransactionTable.tsx` | Paginated transaction list |
| `FilterControls.tsx` | Date range, category, and type filters |
| `StatsPanel.tsx` | Spending summary, income, net amount, and category breakdown. Income (`total_income`) is fetched from the backend independently of type/category filters — it always reflects the full date range. |
| `CategoryRules.tsx` | CRUD UI for regex-based auto-categorization rules |
| `ThemeToggle.tsx` | Dark/light mode slide toggle |

### Debt Analysis components

| Component | Purpose |
|---|---|
| `DebtDashboard.tsx` | Orchestrator; owns all debt state; sub-tabs: Overview, Accounts, Analysis, Import CSV |
| `BudgetInputForm.tsx` | Monthly income/expenses inputs; live-computes available extra for debt payoff |
| `DebtAccountList.tsx` | Accounts grouped by type; promo expiry warnings; exclude toggle; totals footer |
| `DebtAccountForm.tsx` | `@headlessui/react` Dialog modal for add/edit; type-specific fields: credit card (promo balance checkbox + inline promo fields), mortgage (term + start date; auto-excluded), student loan (individual loan entry checkbox; pending loans list; auto-computed totals) |
| `DebtAnalysisPanel.tsx` | "Include mortgage" toggle, run button; snowball vs avalanche comparison cards; Claude AI recommendation block; expandable monthly schedule |
| `DebtCsvUpload.tsx` | Drag-and-drop CSV import for bulk credit card accounts; same pattern as `FileUpload.tsx` |

## Dark mode

Uses Tailwind's `class` strategy (`darkMode: 'class'` in `tailwind.config.js`). The `ThemeProvider` in `lib/ThemeContext.tsx` toggles the `dark` class on `<html>` and persists the preference to `localStorage`. All components use `dark:` variants — follow this pattern when adding new UI.

## Key UI libraries

- `@headlessui/react` — accessible UI primitives
- `@heroicons/react` — icons
- `react-dropzone` — CSV file upload
- `react-calendar` — date picker
- `date-fns` — date formatting
- `react-markdown` + `remark-gfm` — renders AI recommendation narrative (supports tables via GFM)

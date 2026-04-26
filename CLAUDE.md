# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository. See [`docs/dev-best-practices.md`](docs/dev-best-practices.md) for patterns, conventions, and checklists to keep the codebase clean and consistent. See [`docs/data-flow.md`](docs/data-flow.md) for Mermaid diagrams of all data ingestion paths and transformation details.

## Architecture

Full-stack personal budgeting app with a **Next.js 15 frontend** and **Flask backend**, communicating via REST API.

- **Frontend** (`frontend/`): Next.js/TypeScript app. Pages are in `pages/`, React components in `components/`, all API calls go through `services/api.ts` (axios + error interceptor), and shared TypeScript types live in `types/index.ts`. See [`docs/frontend.md`](docs/frontend.md) for full frontend detail.
- **Backend** (`backend/`): Flask app organized as a `budgeting/` package. Entry point is `backend/app.py` (calls `create_app()`). Internal structure:
  - `budgeting/__init__.py` — app factory (`create_app`), blueprint registration, DB init + seeding
  - `budgeting/config.py` — env loading, `DB_ENCRYPTION_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `Config` class
  - `budgeting/extensions.py` — `db = SQLAlchemy()` singleton (imported by models + services)
  - `budgeting/models/transaction.py` — `Transaction` (includes `card_source`, `card_last_four`), `CategoryRule`
  - `budgeting/models/debt.py` — `MonthlyBudget`, `DebtAccount`, `CreditCardPromo`, `StudentLoanItem`
  - `budgeting/models/bill.py` — `Bill` (AES-encrypted amount, soft delete via `is_active`), `BillCategory` (tag-style categories seeded with defaults)
  - `budgeting/services/encryption_service.py` — `_enc_float`, `_dec_float`
  - `budgeting/services/csv_service.py` — `detect_csv_format`, `parse_date`, `process_csv_format1/2`, `prettify_debit_type`, `prettify_credit_type`, `extract_last_four`
  - `budgeting/services/category_service.py` — `auto_categorize_transaction` (two-tier: CategoryRules regex first, then known Bills name match), `recategorize_all_transactions`
  - `budgeting/services/payoff_service.py` — `run_payoff_simulation`, `build_debts_for_analysis`
  - `budgeting/routes/transactions.py` — Blueprint: `/api/health`, `/api/upload-csv`, `/api/transactions`, `/api/stats`, `/api/transaction-types`, `/api/card-sources`, `/api/backfill-transaction-types`, `/api/recategorize-all`, `/api/clear-database`
  - `budgeting/routes/categories.py` — Blueprint: `/api/category-rules` (CRUD + export/import)
  - `budgeting/routes/debt.py` — Blueprint (`url_prefix=/api/debt`): budget, accounts, promos, loans, analyze, SSE recommendation, CSV upload
  - `budgeting/routes/bills.py` — Blueprint: `/api/bills` (CRUD + summary + scan-transactions), `/api/bill-categories` (CRUD). Bill amounts are AES-encrypted. Scan endpoint detects recurring expenses from transaction history (3+ months, ≤20% amount variance)

  Database is SQLite at `backend/instance/budgeting_app.db` (absolute path in `config.py` via `Path(__file__).parent.parent`). AES column-level encryption for all debt/budget/bill amount fields. See [`docs/backend.md`](docs/backend.md) for full detail.
- **AI recommendation** (two-step): Math results return instantly from `POST /api/debt/analyze`, then the AI narrative streams token-by-token from `POST /api/debt/analyze/recommendation` as SSE (`data: {"text": "..."}` chunks, terminated by `data: [DONE]`). Primary provider is `claude-sonnet-4-6` (`anthropic==0.94.1`, `max_tokens=4096`); **Gemini (`gemini-2.0-flash`, `google-genai`) is the automatic fallback** if Claude is unconfigured, raises an exception, or hits `max_tokens`. The backend emits `data: {"provider": "claude"|"gemini"}` as the first SSE chunk so the frontend can reset its buffer on provider switch. Warnings (`data: {"warning": "..."}`) surface as an amber banner. `ai_available` in the analyze response is `true` if either `ANTHROPIC_API_KEY` or `GEMINI_API_KEY` is set. Frontend streams via native `fetch` + `ReadableStream` (not axios) and renders with `react-markdown` + `remark-gfm` (required for table support). Gemini helper: `_stream_gemini(prompt)` in `budgeting/routes/debt.py`.
- **API base URL**: Configured via `NEXT_PUBLIC_API_URL` env var (defaults to `http://127.0.0.1:5000/api`).

### Key data flow
1. User drops a CSV → `POST /api/upload-csv` → Flask detects format (format1 or format2), extracts `card_last_four` from filename (pattern: `Chase(\d{4})`), parses with pandas, deduplicates against existing rows (matched on `transaction_date + description + amount`), auto-categorizes each transaction via `auto_categorize_transaction` (checks active `CategoryRule` regex patterns first, then matches against known `Bill` names by substring, falls back to `'Uncategorized'`), sets `card_source` (`'credit'` for format1, `'debit'` for format2), prettifies `transaction_type` via label mappings, saves new `Transaction` rows. Response includes `saved_transactions` and `duplicate_transactions` counts.
2. `manual_category` overrides `auto_category` — the frontend displays whichever is set.
3. Filtering happens server-side via query params on `GET /api/transactions` — supports `type`, `category`, `start_date`, `end_date`, `card_source`, `card_last_four`. Same filters apply to `GET /api/stats`.
4. `GET /api/transaction-types` and `GET /api/card-sources` return dynamic filter options from DB (used by frontend `FilterControls` dropdown).
5. Known Bills are automatically matched during CSV import (step 1 above). The `POST /api/bills/scan-transactions` endpoint still exists for on-demand detection of recurring expenses but is **not** auto-triggered after upload.
6. Bills integrate into debt analysis: `build_debts_for_analysis()` in `payoff_service.py` includes bill totals in `budget_summary` and the AI recommendation prompt receives bill details. Transaction-derived `variable_expenses` already includes bill payments, so bills are **not** subtracted again from available budget (avoiding double-counting).

## Running the app

**Both at once** (from repo root):
```bash
./start.sh
```
Ctrl+C kills both processes.

**Backend only** (from `backend/`):
```bash
source venv/bin/activate
python app.py
# Runs on http://localhost:5000
```

**Frontend only** (from `frontend/`):
```bash
npm run dev
# Runs on http://127.0.0.1:3000
```

**Environment** — create `frontend/.env.local`:
```
NEXT_PUBLIC_API_URL=http://127.0.0.1:5000/api
```

## Frontend commands (run from `frontend/`)

```bash
npm run dev      # dev server
npm run build    # production build
npm run lint     # ESLint
```

## Backend setup (first time)

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

Create `backend/.env` (required for debt feature):
```
DB_ENCRYPTION_KEY=<64 hex chars — generate with: python3 -c "import secrets; print(secrets.token_hex(32))">
ANTHROPIC_API_KEY=sk-ant-...
GEMINI_API_KEY=AIza...
```

> **CRITICAL**: `DB_ENCRYPTION_KEY` is permanent once encrypted debt rows exist. Changing it makes all debt data unreadable. Omitting both `ANTHROPIC_API_KEY` and `GEMINI_API_KEY` disables AI recommendations gracefully — the rest of the debt feature still works. Setting only one key is fine; the other is used as fallback or skipped.

> **`.env` loading**: `budgeting/config.py` loads `backend/.env` via `Path(__file__).parent.parent / '.env'` — always resolved relative to the file, not the working directory.

> **Database path**: The SQLite DB is pinned to `backend/instance/budgeting_app.db` via `_DB_PATH` in `budgeting/config.py`. Do not rely on working-directory-relative paths.

> **Schema migrations**: There is no Alembic. New columns are added via `ALTER TABLE` directly against the SQLite DB before updating the model. Examples: `sqlite3 backend/instance/budgeting_app.db "ALTER TABLE debt_account ADD COLUMN credit_limit VARCHAR(200);"` (credit limit support), `ALTER TABLE transaction ADD COLUMN card_source VARCHAR(20);` and `ALTER TABLE transaction ADD COLUMN card_last_four VARCHAR(4);` (card source filtering).

> **Python venv note**: The venv may use Python 3.10. If `source venv/bin/activate` doesn't resolve packages correctly, run `venv/bin/python app.py` directly instead of `python app.py`.

## Debt account types

Supported values for `account_type`: `credit_card`, `loan`, `mortgage`, `student_loan`. Defined in `frontend/types/index.ts` (`DebtAccountType`) and validated in `backend/budgeting/routes/debt.py` (`valid_types` list in `create_debt_account`). Adding a new type requires updating both.

- `mortgage` — excluded from payoff analysis by default; supports `loan_term_months` and `start_date`
- `student_loan` — supports nested `StudentLoanItem` sub-loans, each treated as a separate debt in analysis
- `credit_card` — supports `CreditCardPromo` promotional balance periods; optional `credit_limit` field enables per-card utilization display in the form and utilization analysis in AI recommendations
- `loan` — simple account (balance, APR, min payment); no sub-items or promos

## Bills

Bills track recurring monthly obligations (mortgage, subscriptions, utilities, etc.). CRUD via `BillForm` modal; soft-deleted (`is_active=False`). Each bill has an AES-encrypted `amount`, optional `due_day_of_month` (1-31), and an optional `category` selected from `BillCategory` tags.

- **Debt payment linking**: Bills can be marked as `is_debt_payment=True` and optionally linked to a `DebtAccount` via `linked_debt_account_id`. When a bill is flagged as a debt payment, its amount is subtracted from `variable_expenses` in analysis to avoid double-counting (since debt minimum payments also appear in CSV transaction history). `BillForm` has a "Link to Debt Account" dropdown that auto-sets the flag and pre-fills the amount from the account's minimum payment.
- **Bill categories** (`BillCategory` model): tag-style picker in `BillForm`. Seeded with defaults (Housing, Utilities, Insurance, etc.) on first run. Users can create/delete categories; deleting a category clears it from any bills that reference it. `GET /api/category-names` returns a merged list of category names from both `CategoryRule` and `BillCategory`, shown as suggestions in the BillForm picker.
- **Auto-detection**: `POST /api/bills/scan-transactions` scans the last 6 months of expenses, groups by normalized description, and suggests bills appearing in 3+ months with consistent amounts (≤20% variance). Available on-demand but **not** auto-triggered after CSV upload. Suggestions that fuzzy-match a debt account name are flagged with `possible_debt_payment: true`.
- **Auto-categorization from Bills**: During CSV import, `auto_categorize_transaction` checks active Bills as a second-tier match (after CategoryRules). If a transaction description contains a bill's name (case-insensitive substring), the bill's category is applied (or the bill name itself if no category is set). This means pre-defined Bills automatically categorize matching transactions without manual intervention.
- **Summary**: `GET /api/bills/summary` returns `{ monthly_income, total_bills, remaining, bill_count, variable_expenses, remaining_after_all_expenses }`. Income pulled from `MonthlyBudget`; returns 0 if not set.
- **Debt analysis integration**: `build_debts_for_analysis()` computes `debt_payment_overlap` (sum of bills flagged as debt payments) and subtracts it from `variable_expenses` to produce `adjusted_variable_expenses`. This prevents double-counting when debt minimum payments appear in both transaction history and the debt accounts list. The `GET /api/debt/budget` endpoint returns authoritative `available_for_extra_debt` so all frontend components use a single source of truth instead of computing independently.
- **Overlap warnings**: Creating a bill or debt account with a name that fuzzy-matches the other returns a `warning` field suggesting the user mark the bill as a debt payment.

## CSV formats supported

| Format 1 (credit card) | Format 2 (debit/checking) |
|---|---|
| Transaction Date, Post Date, Description, Category, Type, Amount, Memo | Details, Posting Date, Description, Amount, Type, Balance, Check or Slip # |

Format is auto-detected by column headers in `detect_csv_format()` in `budgeting/services/csv_service.py`.

- **Format 1** (`card_source='credit'`): Credit card CSVs. `Type` column typically contains generic values like "Sale", "Payment", "Return", "Fee" — prettified via `prettify_credit_type()` (title-case).
- **Format 2** (`card_source='debit'`): Checking/debit account CSVs. `Type` column contains detailed values like `ACH_DEBIT`, `MISC_DEBIT`, `DEBIT_CARD`, etc. — prettified via `prettify_debit_type()` using `DEBIT_TYPE_LABELS` mapping in `csv_service.py` (e.g., `ACH_DEBIT` → "ACH Debit", `ACCT_XFER` → "Account Transfer").
- **`card_last_four`**: Extracted from the upload filename via regex `Chase(\d{4})`. If the filename is `Chase1234_Activity_20260101.csv`, `card_last_four` = `"1234"`.
- **Backfill**: `POST /api/backfill-transaction-types` re-derives `card_source` and prettified `transaction_type` for all existing rows. Safe to run multiple times.

## Error handling

Three-layer frontend error handling ensures users see plain-English messages instead of raw stack traces:

1. **Axios interceptor** (`services/api.ts`): All API errors pass through a response interceptor that wraps them in `ApiRequestError` with a `userMessage` (plain English), `isConnectionError` flag, and `source` (method + endpoint). Handles network failures, timeouts, and HTTP status codes (400, 404, 500, etc.).
2. **Backend-down detection** (`pages/index.tsx`): On mount, `healthCheck()` runs first. If it fails with a connection error, a full-page "Backend Server Unavailable" screen renders with fix instructions and a Retry button — no other API calls fire. All catch blocks use `getUserMessage()` to extract friendly messages from `ApiRequestError`.
3. **React ErrorBoundary** (`pages/_app.tsx`): Wraps the entire app. Catches uncaught render-time errors and shows error name/message, component stack, and a collapsible full stack trace with Try Again / Reload buttons.

## Frontend layout

The Budget view uses **collapsible accordion sections** (not tabs). `CollapsibleSection` component wraps each area and persists open/closed state to `localStorage` via `storageKey` prop.

**Budget view layout:**
```
Stats Tiles (StatsPanel)
┌─────────────────────────┬─────────────────────────┐
│ Category Breakdown      │ Bills & Monthly Summary  │
│ (CollapsibleSection)    │ (CollapsibleSection)     │
└─────────────────────────┴─────────────────────────┘
▶ Upload CSV           (CollapsibleSection → FileUpload)
▶ Transactions         (CollapsibleSection → FilterControls + TransactionTable)
▶ Category Rules       (CollapsibleSection → CategoryRules)
```

Mobile: columns stack vertically. Multiple sections can be open simultaneously.

**Key frontend components:**
- `CollapsibleSection` — reusable accordion with localStorage persistence and optional badge
- `CategoryBreakdownPanel` — category spending grid (extracted from StatsPanel)
- `BillsPanel` — bill list + summary card
- `BillForm` — `@headlessui/react` Dialog modal for bill CRUD, with tag-style category picker. Supports Cmd/Ctrl+Enter to submit
- `ThemeToggle` — dark mode toggle in header
- `DebtDashboard` — debt analysis view (switched via Budget/Debt Analysis toggle)

## UI state persistence

`activeView` (Budget / Debt Analysis) is persisted to `localStorage` and restored after hydration. Collapsible section open/closed states are persisted individually via their `storageKey` props. Filter state and pagination reset on refresh intentionally.

## No tests

Per the project author's intent, there are no test cases. This is a personal-use app.

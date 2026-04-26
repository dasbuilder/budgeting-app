# Developer Best Practices

Guidelines for keeping this codebase clean, DRY, and maintainable. Read alongside [`docs/frontend.md`](frontend.md) and [`docs/backend.md`](backend.md).

---

## General Principles

- **Don't add what isn't asked for.** No speculative features, extra configurability, or future-proofing abstractions. If three similar lines exist, that's fine — don't extract a helper until there are at least four or five callsites that would genuinely benefit.
- **Don't duplicate what exists.** Before writing a new helper, utility, or component, check whether one already exists. Key locations: `frontend/services/api.ts` (all API calls), `frontend/types/index.ts` (all shared types), `backend/budgeting/services/` (business logic), `backend/budgeting/models/` (data models).
- **Touch only what you need.** A bug fix doesn't require surrounding cleanup. A new field doesn't require reformatting the file. Minimize diff size.
- **Comments only where logic isn't obvious.** The code documents the *what*; comments explain the *why* when it's non-trivial. Don't add docstrings or type annotations to code you didn't write.

---

## Backend Patterns

### Route vs. Service separation

Routes (`budgeting/routes/`) handle HTTP concerns only: parse request, call a service or query, return JSON. Business logic lives in `budgeting/services/`. When a route grows beyond ~30 lines of non-HTTP logic, extract it into a service.

The existing split:
- `payoff_service.py` — debt payoff simulation math
- `category_service.py` — regex auto-categorization
- `csv_service.py` — CSV format detection and parsing
- `encryption_service.py` — `_enc_float` / `_dec_float` helpers

Don't put payoff math in a route, don't put HTTP error handling in a service.

### Encryption: always use `_enc_float` / `_dec_float`

All numeric debt fields are stored as AES-encrypted strings. Never assign a raw Python float directly to an `EncryptedType` column — always go through `_enc_float`. Never read a raw encrypted value directly — always through `_dec_float`.

```python
# Correct
account.balance = _enc_float(data['balance'])
balance = _dec_float(account.balance)

# Wrong — bypasses encryption helpers
account.balance = str(data['balance'])
balance = float(account.balance)
```

`_dec_float` safely returns `0.0` for `None` or invalid values — use this for safe fallback math. When returning a nullable field (e.g. `credit_limit`) where `0.0` and "not set" are semantically different, return `None` explicitly:

```python
'credit_limit': _dec_float(self.credit_limit) if self.credit_limit else None,
```

### Schema migrations (no Alembic)

There is no migration framework. To add a column:

1. Run `ALTER TABLE` directly on the SQLite file **before** touching Python:
   ```bash
   sqlite3 backend/instance/budgeting_app.db "ALTER TABLE <table> ADD COLUMN <col> <type>;"
   ```
2. Add the column to the SQLAlchemy model.
3. Update `to_dict()` if the column should appear in API responses.

Nullable columns with no default are the safe choice for new additions — existing rows will have `NULL`, which `_dec_float` and the `if self.field else None` pattern handle cleanly.

### `to_dict()` is the API contract

Every model's `to_dict()` defines what the frontend sees. Keep it complete and consistent. When you add a model field that the frontend needs, add it to `to_dict()` in the same commit. When you add a field that's internal-only, omit it from `to_dict()`.

### Error handling in routes

Use the pattern already established: wrap the entire route body in `try/except Exception as e`, call `db.session.rollback()` on write errors, log with `traceback.print_exc()`, and return a JSON error with an appropriate status code. Don't invent new patterns.

### `build_debts_for_analysis` is the single source of truth for analysis input

When adding fields that affect debt analysis (e.g. `credit_limit`), add them to the debt dict inside `build_debts_for_analysis` in `payoff_service.py`. The recommendation endpoint receives this dict and shouldn't need to re-query the database to enrich it.

---

## Frontend Patterns

### All API calls go through `services/api.ts`

Never call `axios` or `fetch` directly from a component, except for the SSE streaming endpoint (`POST /api/debt/analyze/recommendation`), which intentionally uses native `fetch` + `ReadableStream` because axios doesn't support SSE streaming. The stream emits a provider chunk (`claude` or `gemini`), then text chunks, terminated by `[DONE]`. Document any new streaming exceptions with a comment.

When adding a new backend endpoint, add a corresponding method to `apiService` in `api.ts`. Keep method names consistent with the operation: `getDebtAccounts`, `createDebtAccount`, `updateDebtAccount`, `deleteDebtAccount`.

### All shared types go in `types/index.ts`

No inline `interface` or `type` definitions inside component files for data that crosses component boundaries. If two components share a shape, it belongs in `types/index.ts`. Component-local state shapes (e.g. `PendingLoan` in `DebtAccountForm.tsx`) can stay local.

When adding a backend field, update the corresponding TypeScript interface in `types/index.ts` in the same change. Frontend and backend contracts should never drift.

### Dark mode: always use `dark:` variants

The app uses Tailwind's `class` strategy. Every new UI element that has a background, border, text color, or shadow needs a `dark:` variant. Follow the existing pattern:

```tsx
// Correct
<div className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700">

// Wrong — invisible or broken in dark mode
<div className="bg-white text-gray-900">
```

Reference existing components for the exact shade pairings in use (e.g. `gray-800` / `white`, `gray-700` / `gray-300`, `gray-600` / `gray-400`).

### Form inputs: use the established `inputClass` / `labelClass` pattern

`DebtAccountForm.tsx` defines `inputClass`, `inputReadOnlyClass`, and `labelClass` constants at the top of the component. Reuse these for any new fields — don't invent new Tailwind strings. If a new input style is needed globally, define it in the same pattern and document it here.

### Conditional fields by account type

Type-specific form fields (e.g. credit limit for credit cards, loan term for mortgages) follow this pattern:
1. Gate rendering with `{accountType === 'credit_card' && (...)}`.
2. Reset the field's state in the `useEffect` that watches `accountType`.
3. Include the value in the save payload only inside the same type guard.

Don't leave stale type-specific state in the payload when the user switches account types.

### State lives in the appropriate owner

`pages/index.tsx` owns budget/transaction state. `DebtDashboard.tsx` owns debt state. Components receive data via props and call callbacks to mutate — they don't fetch their own data unless they're self-contained widgets (e.g. `ThemeToggle`). Don't add `useEffect` data fetches to presentational components.

---

## Adding a New Debt Account Type

Checklist — both sides must be updated in the same change:

1. `frontend/types/index.ts` — add the new value to `DebtAccountType`
2. `backend/budgeting/routes/debt.py` — add to `valid_types` list in `create_debt_account`
3. `frontend/components/DebtAccountForm.tsx` — add `<option>` to the type selector; add any type-specific fields following the conditional field pattern above
4. `backend/budgeting/models/debt.py` — add any type-specific model fields if needed
5. `backend/budgeting/services/payoff_service.py` — decide how `build_debts_for_analysis` should handle this type (include as-is, expand like student loans, or exclude like mortgages)
6. Update `CLAUDE.md` — the **Debt account types** section documents each type's behavior

---

## Adding a New API Endpoint

1. Add the route to the appropriate blueprint in `backend/budgeting/routes/`.
2. Add the corresponding method to `frontend/services/api.ts`.
3. Add or update TypeScript types in `frontend/types/index.ts`.
4. Update `docs/backend.md` — the API Endpoints table is the canonical reference.

---

## AI Prompt Changes

The debt recommendation prompt is assembled in `stream_debt_recommendation` in `backend/budgeting/routes/debt.py`. Guidelines:

- **Pass computed facts, not raw data.** Pre-compute utilization percentages, totals, and comparisons in Python before embedding them in the prompt string. Don't ask Claude to do arithmetic.
- **New analytical sections go after existing ones.** The prompt's `## Instructions` block has a deliberate order: Methodology → Structural Analysis → Credit Utilization → High-Impact Observations → Beyond Payoff. New sections should fit logically into this sequence.
- **Keep data and instructions separate.** The `### Financial Data` block contains numbers; the `## Instructions` block contains what to do with them. Don't mix guidance into the data block or vice versa.
- **Only include data that's reliably available.** If a field is nullable (e.g. `credit_limit`), add it to the data block conditionally and note in the instruction section when it may be absent.

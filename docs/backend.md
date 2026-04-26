# Backend Documentation

See [`docs/dev-best-practices.md`](dev-best-practices.md) for backend conventions (route/service separation, encryption helpers, schema migrations, AI prompt guidelines).

## Architecture Overview

Flask app structured as a Python package at `backend/budgeting/`. The entry point is `backend/app.py` (~5 lines), which calls `create_app()` from `budgeting/__init__.py`. Uses SQLAlchemy ORM with a SQLite database (`instance/budgeting_app.db`). Sensitive debt data is encrypted at the column level using `sqlalchemy-utils` `EncryptedType` (AES via `cryptography`). Pandas is used only for CSV parsing/reshaping — never for database queries.

### Package Structure
```
backend/
├── app.py                         # Entry point — calls create_app()
└── budgeting/
    ├── __init__.py                # App factory: create_app(), _seed_default_rules()
    ├── config.py                  # Env loading, DB path, DB_ENCRYPTION_KEY, ANTHROPIC_API_KEY
    ├── extensions.py              # db = SQLAlchemy() singleton
    ├── models/
    │   ├── transaction.py         # Transaction, CategoryRule
    │   └── debt.py                # MonthlyBudget, DebtAccount, CreditCardPromo, StudentLoanItem
    ├── services/
    │   ├── csv_service.py         # detect_csv_format, parse_date, process_csv_format1/2
    │   ├── category_service.py    # auto_categorize_transaction, recategorize_all_transactions
    │   ├── encryption_service.py  # _enc_float, _dec_float
    │   └── payoff_service.py      # run_payoff_simulation, build_debts_for_analysis
    └── routes/
        ├── transactions.py        # Blueprint: transaction + health routes
        ├── categories.py          # Blueprint: category rule routes
        └── debt.py                # Blueprint: debt routes (url_prefix=/api/debt)
```

**Import order in `create_app()` is critical:** config loads env first, then extensions, then models (so `EncryptedType` captures `DB_ENCRYPTION_KEY` at class-definition time).

### Stack
- **Flask 2.3** — web framework
- **Flask-SQLAlchemy 3.0** — ORM
- **SQLite** — embedded database
- **pandas** — CSV parsing only
- **sqlalchemy-utils EncryptedType (AesEngine/pkcs5)** — column-level encryption for debt data
- **anthropic SDK 0.94.1** — Claude AI (`claude-sonnet-4-6`) for debt payoff recommendations (primary)
- **google-genai** — Gemini (`gemini-2.0-flash`) as automatic fallback if Claude is unconfigured or errors
- **python-dotenv** — loads `backend/.env` at startup

### Environment Variables (`backend/.env`)
| Variable | Purpose |
|---|---|
| `DB_ENCRYPTION_KEY` | 64-char hex key used for AES column encryption of all debt data |
| `ANTHROPIC_API_KEY` | Key for Claude API calls in debt analysis. Omit to skip Claude (Gemini used if available). |
| `GEMINI_API_KEY` | Key for Gemini API (automatic fallback if Claude is unconfigured or errors). Omit to disable Gemini. |

---

## Data Models

### Transaction
Stores individual financial transactions imported from CSV.

| Field | Type | Notes |
|---|---|---|
| id | Integer PK | |
| transaction_date | DateTime | Required |
| post_date | DateTime | Nullable |
| description | String(500) | |
| category | String(100) | Raw category from CSV |
| transaction_type | String(50) | e.g. Sale, Payment |
| amount | Float | |
| memo | String(500) | Nullable |
| auto_category | String(100) | Set by regex rules |
| manual_category | String(100) | User override; takes display precedence |
| balance | Float | Nullable; format2 only |
| check_number | String(50) | Nullable; format2 only |
| csv_format | String(20) | 'format1' or 'format2' |
| created_at | DateTime | UTC |

### CategoryRule
Regex rules used to auto-categorize transactions.

| Field | Type | Notes |
|---|---|---|
| id | Integer PK | |
| category_name | String(100) | |
| regex_pattern | String(500) | Applied case-insensitively |
| is_active | Boolean | Soft-delete via False |
| created_at | DateTime | UTC |
| updated_at | DateTime | UTC |

### MonthlyBudget *(debt feature)*
Single-row table storing the user's monthly budget inputs for debt analysis.
All numeric fields are AES-encrypted strings.

| Field | Type | Notes |
|---|---|---|
| id | Integer PK | |
| monthly_net_income | EncryptedType(String) | Stored as float string |
| fixed_expenses | EncryptedType(String) | Stored as float string |
| variable_expenses | EncryptedType(String) | Stored as float string |
| updated_at | DateTime | UTC |

### DebtAccount *(debt feature)*
Represents a single debt account (credit card, mortgage, or student loan).
Sensitive fields are AES-encrypted.

| Field | Type | Notes |
|---|---|---|
| id | Integer PK | |
| account_type | String(20) | `credit_card`, `loan`, `mortgage`, `student_loan` |
| account_name | EncryptedType(String) | |
| balance | EncryptedType(String) | Float stored as string |
| apr | EncryptedType(String) | Float stored as string |
| minimum_payment | EncryptedType(String) | Float stored as string |
| credit_limit | EncryptedType(String) | Nullable; credit cards only |
| loan_term_months | Integer | Nullable |
| start_date | DateTime | Nullable |
| is_active | Boolean | Soft-delete via False |
| is_excluded_from_analysis | Boolean | Mortgages default True |
| priority_order | Integer | Nullable; manual ordering |
| created_at | DateTime | UTC |
| updated_at | DateTime | UTC |

Relationships: `promos` → `CreditCardPromo` (cascade delete), `loan_items` → `StudentLoanItem` (cascade delete)

### CreditCardPromo *(debt feature)*
Promotional APR periods for a credit card account.

| Field | Type | Notes |
|---|---|---|
| id | Integer PK | |
| debt_account_id | FK → DebtAccount | |
| promo_balance | EncryptedType(String) | |
| promo_apr | EncryptedType(String) | |
| promo_expiry_date | DateTime | Nullable |
| created_at / updated_at | DateTime | UTC |

### StudentLoanItem *(debt feature)*
Individual loan disbursements grouped under a student loan DebtAccount.

| Field | Type | Notes |
|---|---|---|
| id | Integer PK | |
| debt_account_id | FK → DebtAccount | |
| loan_name | EncryptedType(String) | |
| balance | EncryptedType(String) | |
| apr | EncryptedType(String) | |
| minimum_payment | EncryptedType(String) | |
| created_at / updated_at | DateTime | UTC |

---

## API Endpoints

### Existing Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | Health check |
| POST | `/api/upload-csv` | Import transactions from CSV (format1 or format2 auto-detected); deduplicates on `(transaction_date, description, amount)` — response includes `saved_transactions` and `duplicate_transactions` |
| GET | `/api/transactions` | List transactions with filters: `type`, `category`, `start_date`, `end_date`, `page`, `per_page` |
| GET | `/api/stats` | Aggregated stats; `type`/`category` filters apply to spending/categories only; `total_income` is always computed from the date range alone (ignoring type/category filters) |
| GET | `/api/category-rules` | List active rules |
| POST | `/api/category-rules` | Create rule; triggers re-categorization |
| PUT | `/api/category-rules/<id>` | Update rule; triggers re-categorization |
| DELETE | `/api/category-rules/<id>` | Soft-delete rule |
| GET | `/api/category-rules/export` | Export rules as JSON |
| POST | `/api/category-rules/import` | Import rules from JSON |
| POST | `/api/recategorize-all` | Manually re-run auto-categorization |
| DELETE | `/api/clear-database` | Delete all transactions (keeps rules) |

### Debt Analysis Endpoints *(added 2026-04-13)*

All debt endpoints live under `/api/debt/`.

#### Budget
| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/debt/budget` | — | `{ id, monthly_net_income, fixed_expenses, variable_expenses, available_for_debt, updated_at }` |
| POST | `/api/debt/budget` | `{ monthly_net_income, fixed_expenses, variable_expenses }` | Same as GET response |

#### Debt Accounts
| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/debt/accounts` | — | `{ accounts: [...] }` |
| POST | `/api/debt/accounts` | `{ account_type, account_name, balance?, apr?, minimum_payment?, loan_term_months?, start_date?, is_excluded_from_analysis?, priority_order? }` | Account dict (201) |
| PUT | `/api/debt/accounts/<id>` | Any subset of POST body fields | Updated account dict |
| DELETE | `/api/debt/accounts/<id>` | — | `{ message }` (soft delete) |

#### Promos (credit card sub-resource)
| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/debt/accounts/<id>/promos` | — | `{ promos: [...] }` |
| POST | `/api/debt/accounts/<id>/promos` | `{ promo_balance?, promo_apr?, promo_expiry_date? }` | Promo dict (201) |
| PUT | `/api/debt/accounts/<id>/promos/<promo_id>` | Any subset of POST fields | Updated promo dict |
| DELETE | `/api/debt/accounts/<id>/promos/<promo_id>` | — | `{ message }` |

#### Student Loan Items (sub-resource)
| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/debt/accounts/<id>/loans` | — | `{ loan_items: [...] }` |
| POST | `/api/debt/accounts/<id>/loans` | `{ loan_name, balance?, apr?, minimum_payment? }` | Loan item dict (201) |
| PUT | `/api/debt/accounts/<id>/loans/<loan_id>` | Any subset of POST fields | Updated loan item dict |
| DELETE | `/api/debt/accounts/<id>/loans/<loan_id>` | — | `{ message }` |

#### Analysis
| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/api/debt/analyze` | `{ include_mortgage?: bool }` | `{ inputs, snowball, avalanche, comparison, ai_available }` |
| POST | `/api/debt/analyze/recommendation` | `{ include_mortgage?: bool }` | SSE stream: `data: {"provider":"claude"\|"gemini"}`, then `data: {"text":"..."}` chunks, terminated by `data: [DONE]`. Warnings: `data: {"warning":"..."}` |
| POST | `/api/debt/upload-csv` | multipart `file` (CSV) | `{ message, imported_count, skipped_count, accounts }` |

**Student loan expansion in `/api/debt/analyze`:** If a student loan `DebtAccount` has associated `loan_items`, each item is treated as a separate debt entry in the snowball/avalanche simulation (name formatted as `"Servicer — Loan Name"`). If a student loan has no items, the parent account's balance/APR/minimum are used as a single entry. This allows users to simulate payoff of individual disbursements separately.

**Debt CSV format** (for `/api/debt/upload-csv`):
Required columns: `Account Name`, `Balance`, `APR`, `Min Payment`
Optional columns: `Promo Balance`, `Promo APR`, `Promo Expiry`
All imported rows default to `account_type=credit_card`.

---

## Key Architectural Decisions

### 2026-04-13 — Debt Analysis Feature
- Column-level encryption via `sqlalchemy-utils EncryptedType(AesEngine, pkcs5)` rather than full database encryption. Chose this because the app uses SQLite (no native encryption) and this approach encrypts only the sensitive debt fields without requiring a schema migration of existing transaction data.
- Numeric debt values stored as encrypted strings (via `_enc_float`/`_dec_float` helpers) because `EncryptedType` wraps a `String` column — floats must be serialized to/from string explicitly.
- Mortgages default to `is_excluded_from_analysis=True`. Mortgage payoff analysis is fundamentally different from revolving/installment debt and is excluded unless the caller explicitly passes `include_mortgage: true`.
- Payoff simulation capped at 600 months and monthly schedule truncated to first 24 months in the response to keep payload size manageable.
- AI recommendations use a two-provider strategy: `claude-sonnet-4-6` (primary) with `gemini-2.0-flash` as automatic fallback. The recommendation streams via SSE from a separate endpoint (`POST /api/debt/analyze/recommendation`). The first SSE chunk identifies the provider (`data: {"provider": "claude"|"gemini"}`). If neither `ANTHROPIC_API_KEY` nor `GEMINI_API_KEY` is set, the analyze endpoint returns `ai_available: false` and the recommendation endpoint is not called.

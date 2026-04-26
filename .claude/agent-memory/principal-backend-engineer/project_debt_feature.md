---
name: Debt Analysis Feature
description: Context behind the Debt Analysis backend feature added 2026-04-13
type: project
---

Debt Analysis feature originally added to `backend/app.py` on 2026-04-13. On 2026-04-14, the entire backend was refactored from a 1,645-line monolith into the `backend/budgeting/` package structure.

**Why (debt feature):** New product feature allowing users to track debt accounts, set a monthly budget, and run snowball/avalanche payoff simulations with optional Claude AI recommendations.

**Why (refactor):** Monolith had grown large enough to warrant separation of concerns; PM requested the split as a structural cleanup.

**Key decisions to apply in future work:**
- Backend is now a Python package: `backend/budgeting/`. Entry point is `backend/app.py` (5 lines). App factory is `budgeting.create_app()`.
- Import order in `create_app()` is load-bearing: config first, then extensions, then models. Changing this breaks `EncryptedType` because it captures `DB_ENCRYPTION_KEY` at class-definition time.
- `build_debts_for_analysis(include_mortgage)` in `payoff_service.py` is the single source of truth for fetching/filtering debts — both `/analyze` and `/analyze/recommendation` call it.
- Numeric debt values are stored as AES-encrypted strings via `_enc_float`/`_dec_float` helpers — always use these when reading/writing encrypted columns.
- Mortgages default to `is_excluded_from_analysis=True` and are excluded from `/api/debt/analyze` unless `include_mortgage: true` is passed.
- AI recommendation via `claude-sonnet-4-6` is optional — if `ANTHROPIC_API_KEY` is unset or equals `your-key-here`, the analyze endpoint still returns results with `ai_available: false`.
- Monthly schedule in simulation response is capped at 24 months to limit payload size; simulation itself runs up to 600 months max.
- `backend/.env` holds `DB_ENCRYPTION_KEY` (64-char hex) and `ANTHROPIC_API_KEY`. Both are gitignored via `*.env` in root `.gitignore`.
- `docs/backend.md` is the living API + architecture doc for this project.

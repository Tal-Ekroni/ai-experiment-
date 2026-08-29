# קופה (Kupa)

Household CFO for an Israeli home — income vs. expenses, one machine, no cloud.
Built by an adversarial gauntlet loop; the full audit trail lives in `../gauntlet/`.

## Stage 1 — twenty minutes, no credentials

```bash
npm install && npm start        # or: docker compose up
# open http://<host>:3000
```

Export a transactions file from your bank/card site (CSV or "Excel"), drop it in,
confirm 20 merchants, set a household passcode → **your last twelve months**.

Handles real Israeli exports: true `.xlsx` (OOXML), windows-1255, `.xls` that is secretly
HTML, junk header rows, unescaped `בע"מ` quotes, positive-sign card files. Column mapping
is header-aware (it reads the Hebrew column labels) with a numeric-heuristic fallback.

## What it does

- **Ledger that refuses to lie**: integer agorot; card settlement debits matched to the
  issuer's own statement total and excluded as internal; own-account transfers matched
  directionally; ambiguity becomes a question, never a guess.
- **12-item weekly review budget**, ranked by money moved. A skipped week never compounds.
- **Digest that earns each send** (Telegram, optional): good-news bar *lower* than bad-news;
  broken things lead every message and never decay into line items.
- **Answerer** (optional): reply to the bot — *"מה היה ה-1,200 ב-14/8"* — allowlisted
  chat IDs only, fixed intent schema, figures verbatim from the ledger.
- **Self-check** on `/health`, reported through the channel that survives failures.

## Env

| var | effect |
|---|---|
| `ANTHROPIC_API_KEY` | enables LLM categorization of novel Hebrew merchants (≈₪6/yr) — without it, rules-only |
| `KUPA_TELEGRAM_TOKEN` + `KUPA_TELEGRAM_CHATS` | enables digest + Answerer, allowlisted |
| `KUPA_DB`, `PORT` | paths/ports |

## Tests

```bash
npm test
```

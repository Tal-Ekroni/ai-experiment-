# Round 5 — Mandate for round 6 *(confirmation round)*

The bar was cleared. Round 6 must clear it again and produce no blocking finding to converge.

Every item below is bounded and local. **No redesign.** One theme: round 5's new surfaces — staged
setup, the reply channel, the self-check — arrived without the rigour the older sections earned over
four rounds.

## 1. Give health a severity tier above decay *(Realist)*

§5.2's decay rule was built for nags and §5.1 now routes §9.1's self-check through it. So an expired
certificate fires once and becomes a monthly line item while the app keeps sending totals from data
that stopped updating.

- **Chores decay.** A dark account, an OTP prompt, a busy week — fire once, carry as standing state.
- **Broken does not decay.** Certificate expired, scrapers dead, jobs failing, database or disk
  failing: re-state on **every** send and **lead** the message until fixed.

## 2. Allowlist the bot, and say how a question becomes a query *(Security)*

- **Pin the allowed `chat_id`s at stage 3; drop everything else silently.** Telegram bots are
  reachable by anyone who finds the handle, and §5.4 currently answers strangers.
- State explicitly how a question maps to retrieval: a constrained intent classifier with an
  enumerated parameter set, or a model call whose output is **schema-validated before it reaches the
  query layer**. Claim the separation you actually build.

## 3. Make stage 1 survive real Israeli bank exports *(Abandoner)*

Stage 1 rests on "a CSV export is enough" and those exports are `.xls` files that are really HTML,
non-UTF-8 Hebrew headers, three junk rows before the data, and disagreement on sign and date format.

- Ship named parsers for the institutions this household actually uses.
- Behind them, a **column-mapping step**: show the first five rows, let the user say which column is
  date, amount and description, remember it per institution.
- An unparseable file must cost thirty seconds, not an evening — it is the first step of the first
  stage, and bouncing off it happens before anything good has been seen.

## 4. State reconciliation coverage honestly *(Accountant)*

`import` accounts have no balance feed and are structurally unreconcilable; `assisted` accounts sync
monthly, so their localization is thirty days. Stage 1 is entirely `import`, so the app's first
experience rests on an unreconcilable account while §12.3 shows a reassuring status indicator.

- Coverage becomes explicit and visible in aggregate: *"reconciled: 2 of 4 accounts, covering 78% of
  this month's spend."*
- An import-only account is labelled **unreconcilable**, not silently uncovered.

## 5. Ground the Answerer's numbers, and specify the palette *(Skeptic + Craft)*

- **Figures are inserted verbatim from the selected rows**, never generated. Template the numeric
  spine — amount, date, merchant, count — and let the model supply only framing. The second user has
  no dashboard to check against, so a confidently wrong number in that channel is the worst failure
  available.
- **Instrument question volume** so §8.1's ten-a-month estimate becomes a measurement.
- **Specify §12.2's two states on more than hue.** Weight, sign glyph, sentence and position must
  carry the distinction, verified in light mode, dark mode, RTL, and against deuteranopia. Same for
  §12.3's four corner indicators.
- **Acknowledge every question on the bot channel** before answering. Five rounds trained the
  household to read silence as *nothing happened*; silence must never be a possible response to a
  direct question *(Spouse)*.

---

## Out of scope for round 6

Everything not listed above. This is a confirmation round, not a rewrite — new scope here would
reset the convergence clock rather than advance it.

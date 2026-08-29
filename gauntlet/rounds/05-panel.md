# Round 5 — Panel

Seven seats against `05-artifact.md`.

---

## 1. The Spouse Who Didn't Ask For This — dimension 6, **10/10**

**Worst thing:** Silence now means two different things and I can't tell them apart.

**Kill shot:** §5.1 spent five rounds teaching me that silence means *nothing happened*. §5.4 now
lets me ask questions. So on a Tuesday at 11pm I ask *"what was the ₪1,200 on the 14th"* — and the
Mac mini is asleep, or mid-OS-update, or the scraper process is wedged. Nothing comes back. I have
been carefully trained to read silence as reassurance, so I read it as reassurance, and I don't ask
again. The one interface I have fails in the one way I am specifically conditioned not to notice.

That is a small fix and I want to be clear it doesn't undo the round: the app must acknowledge
receipt before it answers, or the box must not sleep, or both. Silence must never be a possible
response to a direct question.

**Highest-leverage change:** Make the two silences distinguishable. A question always gets *some*
reply. Ambient silence keeps its meaning.

**Score justification:** I'm giving this a 10 against the rubric's own words: value without
installing, learning or navigating anything, and the home-network-only constraint defeated rather
than excused. I get value where I already am. I can now *do* something rather than watch. Neither
of us had to change how we live to make it work. The receipt problem is real and it's an
implementation detail, not a gap in the design.

---

## 2. The Week-Three Abandoner — dimension 2, **9/10**

**Worst thing:** Stage 1's twenty minutes assumes a file that parses, and Israeli bank exports are
where that assumption goes to die.

**Kill shot:** §2 makes the whole staging strategy rest on "one account — a CSV export is enough."
Now go actually get one. Leumi hands you an `.xls` that is really HTML. Isracard gives you something
with Hebrew column headers in an encoding that isn't UTF-8. Max's export has three header rows
before the data starts. Cal's changes format depending on which report you pick. None of them agree
on date format, none agree on whether an expense is negative or positive, and several put the
amount and the currency in the same cell.

So my twenty-minute stage 1 becomes: export the file, drop it in, get "could not parse", and now I
am debugging a file format at 10pm on a Tuesday, which is exactly the failure the staging was
designed to prevent. It has just moved from step four to step one — and it's *worse* there, because
now I bounce off before I've seen anything good.

**Highest-leverage change:** Ship known parsers for the specific institutions this household uses,
name them explicitly in the spec, and put a **column-mapping step** behind them for everything else
— show me the first five rows, let me say which column is date, amount and description, remember it.
That turns an unparseable file from a wall into thirty seconds. The retrospect in §11 is worth
protecting with real engineering, not with an assumption.

**Score justification:** The staging is genuinely excellent — value at twenty minutes, nothing
blocking on a domain, the passcode caveat stated honestly in the app rather than hidden. It's the
right shape. The first step of the first stage has an unexamined dependency.

---

## 3. The Bank-Integration Realist — dimension 5, **9/10**

**Worst thing:** §9.1's health reports go through §5.2's decay rule, and decay is exactly wrong for
"the app is broken."

**Kill shot:** §5.2 says every recurring condition fires **once**, then goes quiet and is carried as
standing state in the monthly close. That rule was invented for nags — a dark account, an OTP
prompt, a busy week — and it was the right fix. §5.1 now routes the §9.1 self-check through the same
table, and §9.1 covers certificate expiry, scraper death, failed jobs, database integrity and disk.

So the certificate expires. The self-check fires once. Decay takes over. It is now **standing state
mentioned in the monthly close**, which means for up to four weeks the app is broken and saying so
in a line item. Worse in combination: the scrapers die the following week. That fires once too, and
decays. By month end the app has two dead subsystems and has issued two single notifications, both
already scrolled past, and its ongoing behaviour is to keep cheerfully sending totals from data that
stopped updating.

Decay and health are in direct tension and round 5 wired them together without noticing.

**Highest-leverage change:** Give conditions a severity tier. **Chores decay** — that's what decay
is for. **Broken does not**: it re-states on every send, and it *leads* the message rather than
trailing it, until it is fixed. A dark account for three weeks is a nag. An expired certificate plus
dead scrapers is not a nag, it's an outage, and the household should be unable to miss it.

**Score justification:** §9.1's core insight is genuinely good and generalizes well — health belongs
on the channel that cannot break for the same reasons the app can. Vendoring, pinning and the
written failure procedure are the right answer to a volunteer dependency. The delivery rule
undercuts the mechanism.

---

## 4. The Security Engineer — dimension 3, **9/10**

**Worst thing:** Anyone who knows the bot's handle can message it, and §5.4 never says who is
allowed to ask.

**Kill shot:** Telegram bots are reachable by anyone who finds them. There is no allowlist anywhere
in §5.4 — the spec says "both adults share one channel" and treats the channel as if it were
private because it was *created* for them. It isn't. Someone who guesses or discovers the bot's
handle sends it *"how much did we spend on מסעדות last month"* and §5.4 answers, in seconds, from
anywhere, with no authentication of any kind. Every privacy control in §5.3's carefully-bounded
payload is moot if the query interface will talk to strangers.

The fix is four lines of code — pin the allowed `chat_id`s at stage 3 and drop everything else
silently — which is why it's worth catching now rather than after.

Second, subtler: §5.4 says the model "never writes the query" and "is given the already-selected
rows." But something has to turn *"what was the ₪1,200 on the 14th"* into parameters, and the spec
doesn't say what. If that mapping is a model call producing structured parameters, then the model
does influence retrieval, and a merchant descriptor surfaced in one answer could shape a later
query. Not catastrophic — it's read-only over one household's own data — but the spec claims a
cleaner separation than it has specified.

**Highest-leverage change:** Allowlist the sender IDs. And say explicitly how the question becomes
a query: either a constrained intent classifier with an enumerated parameter set, or a model call
whose output is validated against a schema before it reaches the query layer. Claim the separation
you actually build.

**Score justification:** The narrowest-credential rule applied three times over — read-only
scrapers, isolated bot token, ACME token scoped to one record — is the right principle, and
scoping the DNS credential closes round 4's domain-wide hole properly. §5.3 remains the best-written
section here. The new surface arrived without an access control.

---

## 5. The Accountant — dimension 1, **9/10**

**Worst thing:** Reconciliation doesn't cover every account, and the spec presents it as though it
does.

**Kill shot:** §3.6 reconciles by comparing institution-reported balance snapshots taken on
successive runs. That works for `unattended` accounts, which run nightly. It does **not** work for
`import` accounts — a CSV drop carries transactions, not a balance feed, and often not a balance at
all. And it barely works for `assisted` accounts, which by §2 log in **monthly**: their snapshot
interval is thirty days, so §3.6 degrades to a thirty-day localization, which is not reconciliation
in any useful sense.

Now put that against §2's staging, which makes `import` **the entire first stage**. So the app's
first experience — the twelve-month retrospect, the strongest thing it says all year — is built on
an account that is structurally unreconcilable, and nothing on that screen says so. §12.3 puts
"reconciliation status" permanently in the corner, which will read as reassuring while covering
nothing.

**Highest-leverage change:** Make reconciliation coverage explicit per account and visible in
aggregate: *"reconciled: 2 of 4 accounts, covering 78% of this month's spend."* An import-only
account is honestly labelled unreconcilable rather than silently uncovered. The app's whole
credibility rests on admitting what it can't prove, and this is the one place it currently doesn't.

**Score justification:** §3.6 is now correct in method and honest about its resolution — stating
seven days when it has seven days, defining the gap case with its real span, and routing late deltas
into §3.5's restatement path. That is a genuinely rigorous piece of design. Its scope is narrower
than its presentation.

---

## 6. The Agent Skeptic — dimension 4, **9/10**

**Worst thing:** The Answerer's numbers are prose, and prose is where a number goes to get subtly
wrong.

**Kill shot:** The Answerer phrases an answer over deterministically-selected rows. Fine. But the
output is natural language, and natural language about money is where a model transposes ₪1,200 into
₪1,020, says "last month" when the rows are from the month before, or sums four rows and rounds. Now
consider *who* is reading it: the second user, in a chat window, with **no dashboard** — §5.3
established that her whole relationship with this app is the message channel. She has no way to
check. An answer that is confidently wrong in the one surface that person trusts is worse than no
answer, and it is precisely the failure the rest of this spec has spent five rounds engineering
against.

Also, smaller: §8.1 assumes ten questions a month with no instrumentation behind the number and
nothing bounding it. The risk isn't the cost — it's ₪6 a year, I've conceded that — it's that
nothing in the spec observes or caps a surface the household could use fifty times in a bad week.

**Highest-leverage change:** The figures in an answer are **inserted verbatim from the selected
rows**, not generated. Template the numeric spine — amount, date, merchant, count — and let the
model supply only the framing around it. And instrument the Answerer: log question volume so §8.1's
estimate becomes a measurement.

**Score justification:** The Answerer earns its seat on a ground the four cut agents could not
claim — it is the only interface the second user will ever have — and the spec says so plainly
rather than smuggling a chat box back in. Three agents, one needing no inference at all, cost
answered and then acted on in §4.4. The dimension is working; the newest agent needs the same rigour
the others got.

---

## 7. The Craft Critic — dimension 7, **9/10**

**Worst thing:** §12.2 specifies two emotional states and then names their colours as "warning tone"
and "affirming tone," which is not a specification.

**Kill shot:** Whatever fills those two slots has to survive four conditions simultaneously: light
mode, dark mode, RTL layout, and roughly one in twelve men being red-green colour deficient — and
this is a two-adult household where the odds of that mattering are not small. The obvious pair is
red and green, and it is the worst available answer on three of those four counts. If over-normal
and under-normal are distinguishable **only by hue**, then for a meaningful share of readers the
app's single most important screen conveys nothing at all, and the entire point of §12.2 — that a
good month should *feel* different — evaporates.

The same gap covers §12.3's persistent corner: four status indicators (freshness, reconciliation,
explained %, attributed %) with no specified visual treatment, in the corner of a screen, all of
which need to read as fine-or-not-fine at a glance.

**Highest-leverage change:** Specify the palette, and make the two states differ on **more than
hue** — weight, an arrow or sign glyph, the sentence itself, position. Then check the pair at both
themes and against a deuteranopia simulation before it ships. This is twenty minutes of work that
decides whether §12.2 exists or merely says it does.

**Score justification:** §12.1's composed hero is the right correction — building the most important
element out of laid-out components instead of an interpolated bidi string, and mocking it in both
languages first. §12.2 is a real idea and the table gives it structure. It stops one level above
where it needed to land.

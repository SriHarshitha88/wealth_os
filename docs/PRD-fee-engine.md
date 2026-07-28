# PRD — Fee Engine (Performance Fees)

**Product:** Wealth OS  ·  **Module:** Fee Engine
**Date:** 2026-07-27  ·  **Status:** Draft for review  ·  **Owner:** Advisor (AS Equity Advisory)

---

## 1. Context
Wealth OS bills clients a **performance fee on portfolio appreciation**. The firm's real
structure is a **slab fee on each 20% band of appreciation** over a client's invested capital —
not a flat rate. The Fee Engine shipped today implements a simpler flat-15% high-water model that
does **not** match how the firm bills, which produces wrong numbers in production.

## 2. Current state (production, /fees, 27 Jul 2026 — from screenshots)
- Titled "Fee Engine · High-water mark"; copy "grows past its next 20% trigger… the mark resets."
- KPIs: **Fee due now ₹42.8 L** (2 portfolios crossed), Collected ₹1.0 L, Portfolios tracked 5, **Default fee 15%**.
- Chandrashekar Rama Rao: "15% above high-water", Last basis ₹9.08 Cr, Current ₹11.63 Cr, Next trigger ₹10.90 Cr, **Fee payable ₹38.2 L**.
- **Defect:** "Raise ₹38.2 L fee" → confirm "Raise… and reset the high-water mark" → **OK does nothing** (no fee recorded, no state change).
- **Gap:** clicking a client **name does nothing** — no per-client fee detail/history.

**Why it's wrong:** under the real slab schedule Chandrashekar's +20% milestone fee is **₹9.08 L**, not the ₹38.2 L the flat model shows. (`Collected ₹1.0 L` is Rakesh's already-recorded ₹1,03,648 — so data writes are live, only the compute/UI is stale.)

## 3. Problem statement
Advisors cannot (a) see correct fees per the firm's real slab schedule, (b) reliably bill a crossed
milestone, or (c) see a client's fee history (what was charged, when, how much). This blocks accurate
billing and client statements.

## 4. Goals / Non-goals
**Goals**
- Compute fees per the **real slab schedule** (§6).
- **Bill a crossed milestone in ≤2 clicks**, recorded with amount + date.
- **Per-client fee detail** on name click (history + upcoming). ← primary new ask
- **Record offline/historical payments** with a specific date (e.g. Rakesh's June fee).
- Correct KPIs and copy.

**Non-goals (v1):** invoicing/PDF gateway, payments collection, tax/GST, per-client negotiated rates, automated reminders.

## 5. Users & jobs-to-be-done
- **Advisor (primary):** "When a client crosses an appreciation milestone, bill the right fee and keep a clean record I can show the client."

## 6. Fee model (canonical spec)
Capital **C** = client's invested amount. Appreciation is measured vs C. Each 20% band is billed
**once**, when its milestone is first crossed:

| Milestone (gain over C) | Band | Rate | Fee for the band |
|---|---|---|---|
| +20% | 1 | 5% | 5% × 0.2C |
| +40% | 2 | 10% | 10% × 0.2C |
| +60% | 3 | 12.5% | 12.5% × 0.2C |
| +80% | 4 | 15% | 15% × 0.2C |
| +100% | 5 | 25% | 25% × 0.2C |
| above +100% | — | 25% flat | 25% × (value − 2C) on the excess |

Rules: a band's fee is charged on the **full band** at its milestone (not pro-rata); milestones are
**fixed vs C** (no compounding reset); each milestone billed **exactly once**.
Worked example — Rakesh, C = ₹1,03,64,815: +20% → **₹1,03,648** (paid 30 Jun 2026).

## 7. Requirements

**F1 · Slab computation** — *P0, built (pending deploy)*
Per client: appreciation %, milestone reached, billed-to level, **fee due now**, next milestone +
projected fee. "Billed" state is the source of truth from the fees ledger.

**F2 · Client fee detail on name click** — *P0 (primary ask)*
Clicking a client (name/card) opens a **slide-over drawer**:
- Header — name, capital C, current value, appreciation %, current milestone.
- **Milestone ladder** — all 5 bands + >100%, each with rate, target value, and status:
  *Billed ✓ (date + amount)* / *Due now* / *Upcoming (projected fee)*.
- **Billed history** — date, milestone, rate, amount, running total collected.
- **Actions** — Bill next milestone (if crossed); Record offline payment; (P2) download statement.
- *Rationale:* advisors need per-client transparency for client conversations & statements; a drawer keeps them in context on the list.

**F3 · Fix "Bill milestone" action** — *P0 (defect)*
- On confirm, record the newly-crossed band(s) with amount + date, mark them billed, and refresh the
  UI so "fee due" → ₹0 and history updates; surface errors visibly (no silent no-op).
- Fix copy: not "reset high-water" → **"Bill the +X% milestone fee of ₹Y for {client}?"**
- Handle **multiple bands crossed at once** in a single action.

**F4 · Record historical / offline payment** — *P1*
UI to log a past milestone payment with a **specific date** (backfill), so history is accurate.
(A script exists — `scripts/record-milestone-fee.mjs`; this productizes it.)

**F5 · Accurate KPIs & copy** — *P1*
"Fee due now", "Collected to date", "Milestones billed"; replace "Default fee 15%" with the
**schedule (5 → 25%)**; update the page subtitle to slab language.

**F6 · Per-client fee statement export** — *P2*
PDF statement (milestones, dates, amounts) reusing the existing @react-pdf setup.

## 8. Data model
- `fee_marks.last_basis` = capital **C** snapshot (pinned; not reset).
- `fees` ledger = source of truth. Each performance fee is tagged in `invoice_no`:
  `PF-L{level}` (bands billed up to level) or `PF-ABOVE` (a >100% charge); with `amount`,
  `paid_at`, `due_date`, `status='Collected'`.
- Billed state is **derived** from the ledger — **no schema migration required**.

## 9. Edge cases
- Below capital (loss): no fee; show "Below capital."
- Client adds/withdraws funds mid-period: C is snapshotted — provide a "reset capital" control. *[open]*
- Multiple bands crossed at once → bill all in one action.
- Above +100%: flat 25% on excess above 2C, tracked via `PF-ABOVE`.
- Idempotency: never double-bill a milestone.
- Rounding: define paise vs whole-rupee display.

## 10. Success metrics
- Any crossed milestone billable in **≤2 clicks**.
- Fee numbers **match the advisor's manual sheet** on spot-check.
- **0 double-bills.**
- Advisor can answer "what has client X paid in fees?" from the drawer without leaving the page.

## 11. Open questions
- Capital base when a client adds/withdraws funds — snapshot vs recompute?
- Fee period / financial-year handling; does anything reset across years?
- **Chandrashekar:** is the +20% (₹9.08 L) genuinely outstanding, or already paid offline (then backfill it)?
- Currency/rounding convention.

## 12. Rollout (phased)
1. **Deploy the slab engine** (F1, F5) — corrects production numbers. *(ready now)*
2. **Fix the bill action** (F3).
3. **Client fee drawer** (F2) + **record-payment UI** (F4).
4. **Statement export** (F6).

---

### Appendix — screenshot observations (27 Jul 2026)
- Prod still runs the flat-15% high-water engine (title, copy, "Default fee 15%").
- "Fee due now ₹42.8 L / 2 portfolios crossed" = old flat calc (Chandrashekar ₹38.2 L + Rakesh ≈ ₹4.6 L).
- "Collected ₹1.0 L" = Rakesh's recorded ₹1,03,648 → confirms data writes are live, compute/UI is stale.
- Confirm dialog OK is a no-op → F3 defect.
- Client name/card not clickable → F2 gap.

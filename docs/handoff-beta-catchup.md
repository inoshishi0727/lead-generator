# Lead Generator Update

---

## ✂️ Brief for Claude (read this first, then format the content below)

**Audience:** the Asterley Bros team using the lead generator tool. Smart, busy, not technical. Cares about workflow speed, signal vs noise, and whether they can immediately spot the best leads and the worst categories.

**Goal:** a polished update explaining what the tool can now do, with a handful of real scenarios.

**Tone:** plain, direct, confident. No marketing fluff. No technical layering. Talk about the tool as if it's a coworker, not a system with components.

**Format:** clean and scannable. Use headings, short paragraphs, bullets, tables, callout boxes where they help.

**Brand voice rules to respect:**
- No em dashes or en dashes. Use full stops, commas, or "and".
- Never describe things as "wonderful", "fantastic", "delightful", "lovely", "amazing", "great".
- SCHOFIELD'S always in all caps when naming the product.

**Screenshot placeholders:** there are 13 spots marked `📸 [filename] — what to capture` (plus a handful of optional scenario shots). Preserve all of them.

**What to do:**
- Keep all content below.
- Polish prose where it could be tighter.
- Improve hierarchy if you see opportunities.
- Don't add new content or invent features.

---

## Content

---

# Lead Generator — What's Changed

**For:** Asterley Bros team
**Date:** 2026-06-17

---

## TL;DR

Ten changes to how the tool works day to day:

1. **The leads list now ranks by expected revenue, not just fit.** A new "Highest priority" sort multiplies the fit score by the venue's volume potential (category, group size, multi-site signals) so a strong-fit restaurant group floats above a strong-fit single deli. Each lead carries a small High / Med / Low badge so you can read it at a glance.

2. **Strong and weak fits read in colour.** Strong is green. Moderate is orange. Weak is red. You can scan a list of 200 leads and see the picks instantly.

3. **You can filter the leads list to what came in recently.** A chip group above the table: All time, Today, 7 days, 30 days. One click, no menu hunting.

4. **Every row shows when it was added.** A new Added column tells you "3h ago" or "4d ago" at a glance. Hover for the exact timestamp.

5. **The category breakdown on Analytics is a donut chart, not a treemap.** All categories visible at once. The long tail collapses honestly into one "Other" wedge. Hover any slice or row to drill in.

6. **Review and Inbox got tidier.** Lead info (venue, menu, contact, products, drinks programme) now lives in a sticky right sidebar instead of stacked above every email, so the body has more vertical room. The list of leads on the left now shows the venue category as a small chip under each name. The Venue and Fit filters sit on the same row as the Focus pills, so the controls all live together.

7. **Search actually suggests now.** Type in the leads search box or the global search bar at the top and you get a drop-down of matching leads as you type. Click a match to open the lead directly. Press Enter without picking a suggestion and the existing full-text filter kicks in, same as before.

8. **The Diagnostics generation log opens when you click it.** Click a row, the full subject and content unfold inline. Click again to collapse. No more dead clicks.

9. **The Outreach stat row spreads across the page.** Drafted, Sent this week, Replied, Follow-ups, Scheduled now fill the row evenly instead of bunching at the left with empty space on the right.

10. **A handful of small polish.** The stuck-leads panel remembers if you collapsed it. The AI Cost bars stopped shouting at you. The Analytics category chart no longer cuts off the right-hand wedges.

All ten are live. None of them require a setting to turn on.

---

## Best leads first

You used to open the leads list, see a flat sortable column of scores, and have to mentally weight which row was actually worth your morning. A score of 8 on a single neighbourhood bar reads the same as a score of 8 on a 12-venue restaurant group, even though one of them is worth 20 times the volume of the other.

That's fixed.

### What it looks like

Open the leads list. In the Sort dropdown there is a new option, third from the top: **Highest priority**.

> 📸 **`01-priority-sort.png`** — the Sort dropdown open with "Highest priority" highlighted. Should show the full 7-option list.

Pick it. The list reorders by a composite number: the fit score multiplied by the venue's volume potential. Volume potential is inferred from the category (a restaurant group scores higher than a deli), the LinkedIn company size if we know it, and a keyword scan of the business summary for multi-site signals like "group", "locations", "across London".

Every row has a small badge sitting next to the score: **High** in green, **Med** in orange, **Low** in slate. You can hover for the exact priority number.

> 📸 **`02-priority-badges.png`** — three rows of the leads table next to each other. One High, one Med, one Low. The numeric score is still visible alongside.

### Why it matters

Before this, you eyeballed a list of 100 leads and picked. Now the top of the list is the top of the list. Your hour goes to the accounts most likely to pull volume, not the accounts that happen to be at the top of an alphabetical sort.

### Tweakable

The formula is a baseline, not a finished product. The category weights, the LinkedIn size boosts, the multi-site keywords, the High and Med thresholds all live in one file. If a wine bar should be weighted closer to a cocktail bar, or if "portfolio" should count more strongly as a multi-site signal, it is a one-line edit and the next page refresh shows the new ranking. No database changes, no batch reprocessing.

---

## Colour-coded fit

The old fit indicator was a grey pill that said "weak fit" or "strong fit" in slightly different muted tones. On a long list it blended in.

Three colours now:

- **Strong fit** is green.
- **Moderate fit** is orange.
- **Weak fit** is red.

> 📸 **`03-fit-colours.png`** — a section of the leads list with at least one of each fit colour visible. Should be obviously different from a glance, not just on hover.

### Where you'll see it

Five places, all on the same palette:

- The leads list Fit column
- The lead detail dialog
- The dashboard's Top 10 Eligible cards
- The Outreach plan list
- The message card on Review

### Why it matters

You can now scan a list of 200 leads and see immediately where the strong picks are clustered. The weak fits drop into the background where they belong. The colour doesn't lie about the underlying data, it just makes the signal louder.

---

## Recently added leads, where you need them

Two changes to the leads list focused on time.

### The chip group

Above the table, next to the Sort dropdown, there is a new row of chips: **All time**, **Today**, **7d**, **30d**.

> 📸 **`04-recency-chips.png`** — the leads list filter row with the chip group visible. "All time" highlighted as the default.

Click one and the table filters to leads created in that window. The URL updates so a refresh keeps your view. The chip composes with everything else: the Stage filter, the Source filter, the Sort, the search box. Pick "Today" plus Sort "Highest priority" and you see the highest-priority leads added in the last 24 hours.

### The Added column

A new column sits between Postcode and Score: **Added**. Each row shows a relative time. "3h ago". "4d ago". "2mo ago". Hover for the absolute timestamp.

> 📸 **`05-added-column.png`** — a few rows of the leads table with the Added column populated. Should show a mix of "Xh ago", "Xd ago", and "Xmo ago".

### Why it matters

You used to scroll a date column in your head, doing arithmetic against the current date to figure out "is this lead from this week or three months ago?". The chip group answers that question with one click. The column answers it without any click at all.

---

## Categories at a glance

The "Leads by Category" chart on Analytics used to be a treemap. Tiles in proportional sizes, names cut off, smaller categories running off the right edge of the card with no way to reach them.

It is now a donut.

> 📸 **`06-category-donut.png`** — the new donut chart on `/analytics`. Should show the donut with the total in the centre, the top 10 wedges around it, and the side legend listing each category with its count and percentage.

### What's on the chart

- A donut in the middle, with the total lead count in the centre.
- Up to 10 wedges, sized by category share, coloured from a stable palette.
- An "Other (N more)" wedge in grey that absorbs categories beyond the top 10, so you see the long tail honestly.
- A side legend with a coloured dot, the category name, the count, and the percentage.

Hover any wedge and it pops outward. The legend row highlights. A tooltip card below the donut shows the category's count, percentage of total, average score, and conversion rate.

Hover a legend row and the matching wedge highlights. The interaction works both ways.

### Why it matters

You can see every category, including the small ones, on one screen. The treemap version hid them past the right edge and they had no representation at all. The donut tells you about your pipeline shape in two seconds.

---

## Review and Inbox got tidier

Three things on the same pages.

### Lead info moved to a sidebar

Every draft you review used to start with a block of metadata stacked at the top: To, Venue, Menu, Contact, Products, the collapsible drinks programme. Five or six lines of context before you could see a word of the email itself. On a long draft, that meant scrolling.

That information now sits in a fixed sidebar on the right of the email. The body of the email gets the full vertical room on the left. The sidebar stays put while you scroll the body, so you can always look across to check the venue or the menu without losing your place.

> 📸 **`07-review-sidebar.png`** — a draft in `/review` showing the email body on the left and the right sidebar with TO, VENUE, MENU, CONTACT, PRODUCTS, and the drinks programme toggle. The labels in the sidebar are small uppercase.

The labels in the sidebar are small uppercase ("TO", "VENUE", "MENU", "CONTACT", "PRODUCTS"), which makes the column feel like a sidebar and not a paragraph.

On narrow screens (tablet, narrow window) the sidebar drops below the body so nothing gets cramped.

### Category chip on each card

The list of leads on the left of Review and Inbox now shows a small category chip under each lead's name. Cocktail Bar. Wine Bar. Gastropub. You can scan the list and see the mix without opening every card.

> 📸 **`08-category-chip-on-cards.png`** — the list rail showing 4 or 5 cards, each with a category chip under the business name. Should show a mix of categories.

The chip is hidden when the list is already filtered to one category (Focus Mode), since repeating the cohort label on every row adds nothing.

### Filter controls collapsed to one row

The Venue dropdown, the Fit dropdown, and the Focus pills used to occupy two separate rows. They now sit on the same line: Venue first, Fit next, then "Focus next batch on" and the pills.

> 📸 **`09-filter-row-merged.png`** — the filter row showing Venue / Fit / Focus next batch on / Cocktail Bar / Gastropub / Wine Bar all on one line.

On a narrow viewport the row wraps to two lines automatically.

---

## Search suggests as you type

Two search boxes got smarter.

### The leads search

Type in the search box above the leads list and a dropdown appears with up to eight matching leads. Each suggestion shows the business name, the email address or area below it, and the venue category on the right.

Click a suggestion and the lead's detail dialog opens directly. No need to clear the search, find the row, then click it.

> 📸 **`10-search-autocomplete-leads.png`** — the leads list search box with a dropdown of 4 or 5 suggestions visible. Each suggestion should show the business name, sublabel, and category chip on the right.

Use the keyboard if you prefer: arrow keys to move through the suggestions, Enter to open, Escape to close the dropdown. If you don't pick a suggestion and just press Enter, the table filters by your text the way it always has.

### The global search

The same dropdown appears in the top search bar that lives on every page. Type a venue name, click a match, and you're taken straight to that lead's detail. Press Enter without picking one and you land on the leads list filtered to your text, same as before.

> 📸 **`11-search-autocomplete-global.png`** — the global topbar search with a dropdown of matching leads. Should show the bar on a non-leads page (e.g. Dashboard or Analytics) to make clear it works from anywhere.

The ⌘K shortcut still focuses the global search.

### Why this matters

You used to type a name, watch the table narrow, find the row, click it. Three steps. Now it's type, click, done.

---

## The generation log actually opens

The Generation Log on Diagnostics was a list of rows that did not respond to clicks. The drafts existed in the data but you could not see them.

Now you can click any row. The chevron rotates, the row expands, the full subject and full content unfold inline.

> 📸 **`12-log-expanded.png`** — the Generation Log with one row expanded. Should show the chevron, the subject block, and the content block below.

Click the same row again to collapse it. Click a different row and the previous one closes and the new one opens. One open at a time keeps the page readable.

### Why it matters

You can now spot-check what the model produced for a specific lead without leaving the page or guessing from a truncated subject line.

---

## Small polish

Two things that aren't worth their own section.

**The stuck-leads panel remembers if you collapsed it.** If you collapse the "Needs attention" panel on the Dashboard, it stays collapsed when you refresh the page. If you expand it, it stays expanded. The preference lives in your browser, so collapsing it on one machine does not collapse it on another.

**The AI Cost bars are quieter.** The daily-spend chart on the AI Cost page used to be bright green bars on a hard black background. The bars now use a muted track and a softer fill. The data is the same, the visual fatigue is gone.

> 📸 **`13-cost-bars-after.png`** — the daily-spend chart on `/analytics/cost` after the change. Should look calm. The high-spend days still stand out but no longer like neon traffic.

---

## Sample scenarios

A few real journeys.

### Scenario A. Working your morning queue by priority

1. Open `/leads`.
2. Open the Sort dropdown, pick "Highest priority".
3. Scan the top 10 rows. Notice the Priority column shows mostly **High** green badges. Notice the Fit column shows mostly green strong-fit text on those rows.
4. Click into the top lead. It is a 4-venue restaurant group in central London. The detail dialog confirms the category and the LinkedIn company size.
5. Generate a draft. Move on to the next.

**Why this matters:** you used to eyeball a flat list and guess. The top of the list is now the top of the list.

> 📸 **`scenario-a-priority-flow.png`** — optional. The leads list sorted by Highest priority with the badges visible on the top rows.

### Scenario B. Catching up on the week

1. Open `/leads`.
2. Click the **7d** chip.
3. The table narrows to leads added in the last week.
4. Switch the sort to "Highest priority".
5. You're now looking at the best-value leads that came in this week, in priority order.

**Why this matters:** Monday morning, you can answer "what new accounts arrived since last Monday and which ones should I work first" in two clicks.

> 📸 **`scenario-b-recent-and-ranked.png`** — optional. The leads list with the 7d chip highlighted and the Sort set to Highest priority.

### Scenario C. Spotting a category we're over-indexed on

1. Open `/analytics`.
2. Look at the donut. The Cocktail Bar wedge is roughly a quarter of the total.
3. Hover the Wine Bar wedge. The tooltip shows 76 leads at 16 percent, score 7.6, conversion 0 percent.
4. Hover the "Other (3 more)" row. The tooltip shows 12 leads across 3 small categories.
5. Conclude that the pipeline is wine-and-cocktail heavy and the long tail is small but real.

**Why this matters:** you can see your pipeline mix in one frame, which makes it possible to balance scrape queries the next week.

> 📸 **`scenario-c-donut-hover.png`** — the donut with one wedge highlighted and the tooltip card visible.

### Scenario D. Verifying a specific draft from the log

1. A reply came in this morning referencing a draft sent last week.
2. Open `/log`.
3. Click the row for that lead. The full subject and content expand inline.
4. Confirm what the lead saw, decide how to reply.

**Why this matters:** before, that row didn't respond to clicks. You had to dig through Outreach to find the same content. Now it's two clicks.

---

## What hasn't changed

Worth being explicit:

- **Daily cap.** Still 20 drafts a day, still 150 sends a day.
- **Send window.** Still Tue, Wed, Thu, 10am to 1pm London time.
- **Brand voice rules.** Still enforced. No em dashes, no banned phrases, SCHOFIELD'S in caps when named, all the rest.
- **The cold-open structure.** Step 1 emails still follow the 7-step skeleton.
- **Focus Mode on Outreach.** Untouched.
- **Smart follow-ups.** Untouched.
- **Marlow, the Prompt Coach agent.** Same persona, same overlay flow. The suggestion pills shown on first open were updated to match what Marlow can actually do, but the agent itself is unchanged.
- **Reply matching, inbound replies, conversation threads, client tagging.** Untouched.

---

## How to test it yourself

The fast version, in roughly the order things landed:

1. **Donut.** Open `/analytics`. Hover the wedges. Hover the legend rows.
2. **Fit colours.** Open `/leads`. Scan the Fit column. Strong should be green, weak red, moderate orange.
3. **Generation log.** Open `/log`. Click a few rows.
4. **Recency chips.** Back on `/leads`. Click Today, 7d, 30d, All time. Watch the URL update.
5. **Added column.** While on `/leads`, find the new column between Postcode and Score.
6. **Priority sort.** Open the Sort dropdown on `/leads`, pick "Highest priority". Confirm the top rows show **High** badges.
7. **Search autocomplete.** On `/leads`, type a venue name in the search box. A dropdown should appear. Click a match and the detail dialog opens. Try the same in the global search bar at the top.
8. **Review sidebar.** Open `/review` and click into a draft. The TO/VENUE/MENU/CONTACT/PRODUCTS info should sit in a column on the right of the email body.
9. **Category chip on cards.** While in `/review` or `/inbox`, look at the list of leads on the left. Each card should show a small category chip under the business name.
10. **Filter row.** On `/review` or `/outreach`, confirm Venue / Fit / Focus pills all sit on the same line.
11. **Outreach stat row.** On `/outreach` or `/review`, confirm the Drafted / Sent / Replied / Follow-ups / Scheduled cards spread evenly across the row.
12. **Stuck leads panel.** On `/`, collapse the "Needs attention" panel and refresh. It should stay collapsed.
13. **Cost bars.** Open `/analytics/cost`. Confirm the bars look calm.

---

## How to give feedback

Two layers, two ways in.

**Visual or workflow feedback** (the donut, the fit colours, the recency chips, the Added column, the priority badge, the review sidebar, the category chip on cards, the merged filter row, the search dropdown, the panels, the cost bars):
Send a short note with what you saw, what you wanted, ideally a screenshot. Examples: "the High threshold is too generous, half my list is green", "I want the review sidebar narrower", "the search suggestions are sorting by the wrong thing", "the donut tooltip overlaps the legend on small screens".

**Priority-score formula feedback** (the way leads rank under Highest priority):
Send the lead's business name, the priority number you see, and what you think it should be. Or a comparison: "this restaurant group is ranking below this cocktail bar and that feels wrong". The formula lives in one file and is meant to be tuned with real examples.

---

## What's next

A few items on the list:

- **Persistent client resurfacing.** Today's tool catches new leads and follow-ups. It does not yet remind you to circle back to a current account or a stalled discussion. A "Due to resurface" queue is being scoped.
- **Failed scrape retry.** The `/scrapes` page surfaces failures with a "Re-run with same params" button. The button currently shows a toast and does not yet kick the run. Wiring that through is on the list.
- **Per-category reply-rate metrics.** Once the priority sort has been in use for a couple of weeks, we can break reply rate down by category and tune the volume potential weights from real outcomes, not guesses.
- **Treemap option as a toggle.** Some people prefer the treemap's proportional area read. We can offer it as an alternative view on Analytics if the donut feels limiting.

---

*End of update.*

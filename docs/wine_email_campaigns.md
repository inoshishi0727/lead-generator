# Wine seller email campaign sequences

A reference guide covering all 6 campaign types, their full automation flow, and ready-to-use copy for each email.

---

## Table of contents

1. [Welcome series](#1-welcome-series)
2. [Promotional campaign](#2-promotional-campaign)
3. [New vintage / release](#3-new-vintage--release)
4. [Seasonal / occasion](#4-seasonal--occasion)
5. [Re-engagement campaign](#5-re-engagement-campaign)
6. [Newsletter / content email](#6-newsletter--content-email)

---

## 1. Welcome series

**Type:** Automated  
**Trigger:** New subscriber joins the list  
**Audience:** Cold leads / first-time subscribers  
**Duration:** 7 days  
**Emails:** 3  

### Flow

```
[User subscribes]
       |
       v
[Email 1 — Day 0, immediately]
       |
       v
[Did they purchase?]
   YES --> exit sequence, enter post-purchase flow
   NO  -->
       |
       v
[Email 2 — Day 3]
       |
       v
[Did they purchase?]
   YES --> exit sequence
   NO  -->
       |
       v
[Email 3 — Day 7]
       |
       v
[Did they purchase?]
   YES --> exit sequence
   NO  --> move to re-engagement list after 30 days of inactivity
```

---

### Email 1 — The warm welcome

**Send:** Immediately on signup  
**Goal:** Deliver on the signup promise, introduce the brand, make them feel welcome  
**Subject:** `Welcome — here's something to get you started`  
**Preview text:** `You're in. Here's what to expect from us — and a little something for joining.`

---

**Body copy:**

> Hi [First name],
>
> Welcome — and thank you for joining us.
>
> We're [Brand name], and we've spent years tracking down wines that are worth your time. Not the ones with the flashiest labels or the biggest marketing budgets — the ones that actually taste remarkable.
>
> As a thank you for joining, here's **10% off your first order**:
>
> **Use code: WELCOME10**
>
> There's no catch and no expiry pressure — though the offer does last just 7 days, so don't forget about it.
>
> Over the coming weeks, we'll share the occasional pairing tip, a new arrival we're excited about, or something we think is worth knowing. We promise to keep it useful and not flood your inbox.
>
> In the meantime, take a look at what we have in:
>
> **[Shop our wines →]**
>
> Cheers,  
> [Founder name]  
> [Brand name]

---

**CTA button:** `Shop our wines`  
**CTA URL:** `/shop`

---

### Email 2 — The story & education

**Send:** Day 3 (only if no purchase made)  
**Goal:** Build trust and brand affinity through story and useful content  
**Subject:** `How we choose every bottle we sell`  
**Preview text:** `Not every wine makes the cut. Here's what we look for — and a pairing tip for this weekend.`

---

**Body copy:**

> Hi [First name],
>
> We get asked a lot: how do you decide which wines to stock?
>
> The honest answer is we taste a lot of them. Most don't make it. What we're looking for isn't just quality — it's character. Wines that have a reason to exist. A producer who cares about the soil, the climate, the people picking the grapes.
>
> It's a slower way of doing things, but it means every bottle on our site is one we'd actually open ourselves.
>
> **This weekend's pairing tip:**  
> If you're cooking something rich — a slow-braised lamb, a mushroom risotto — try pairing it with a wine that has good acidity. It cuts through the fat and lifts the whole dish. A Barbera d'Asti or a good Côtes du Rhône works brilliantly here.
>
> If you haven't had a chance to browse yet, your welcome discount is still valid:
>
> **Use code: WELCOME10**
>
> **[Explore our selection →]**
>
> Cheers,  
> [Founder name]  
> [Brand name]

---

**CTA button:** `Explore our selection`  
**CTA URL:** `/shop`

---

### Email 3 — The gentle push

**Send:** Day 7 (only if no purchase made)  
**Goal:** Convert fence-sitters before the welcome offer expires  
**Subject:** `Your welcome offer expires soon`  
**Preview text:** `Still thinking? We picked three bottles you might love — your 10% off ends tonight.`

---

**Body copy:**

> Hi [First name],
>
> Just a quick note — your 10% welcome discount expires tonight at midnight.
>
> If you haven't had a chance to browse yet, here are three bottles our customers keep coming back to:
>
> ---
>
> **[Product name]** — [Region], [Grape variety]  
> *"[Short tasting note — e.g. Silky, with dark cherry and a long finish. Brilliant with a Sunday roast."]"*  
> ~~£XX.XX~~ → **£XX.XX with WELCOME10**
>
> ---
>
> **[Product name]** — [Region], [Grape variety]  
> *"[Short tasting note]"*  
> ~~£XX.XX~~ → **£XX.XX with WELCOME10**
>
> ---
>
> **[Product name]** — [Region], [Grape variety]  
> *"[Short tasting note]"*  
> ~~£XX.XX~~ → **£XX.XX with WELCOME10**
>
> ---
>
> All orders come with free returns if something isn't right, and we ship in protective packaging so nothing arrives damaged.
>
> **[Claim your discount now →]**
>
> After tonight, the code won't work — but you'll always be welcome to order at full price (and the wines will still be worth it).
>
> Cheers,  
> [Founder name]  
> [Brand name]

---

**CTA button:** `Claim your discount now`  
**CTA URL:** `/shop?discount=WELCOME10`

---

---

## 2. Promotional campaign

**Type:** Manual / scheduled  
**Trigger:** Seller creates and schedules a promotion  
**Audience:** All active subscribers, or segmented by purchase history  
**Duration:** 5–7 days  
**Emails:** 4  

### Flow

```
[Seller sets up promotion: discount / bundle / free shipping]
       |
       v
[Email 1 — Day 0: Announcement]
       |
       v
[Email 2 — Day 2: Value deepener (for non-purchasers)]
       |
       v
[Email 3 — Day 5: Mid-campaign reminder (for non-purchasers)]
       |
       v
[Email 4 — Day 7: Last chance — offer ends today]
       |
       v
[Offer expires — exit all recipients]
```

> **Condition gate:** Anyone who purchases during the campaign is removed from remaining emails in the sequence.

---

### Email 1 — The announcement

**Send:** Day 0  
**Goal:** Launch the offer clearly and drive immediate action  
**Subject:** `[X]% off this weekend — our biggest sale of the season`  
**Preview text:** `No code needed. Just pick your wines and the discount applies at checkout.`

---

**Body copy:**

> Hi [First name],
>
> We don't do sales often. When we do, we make them worth it.
>
> This weekend, **[X]% off everything on the site** — no code needed, discount applies automatically at checkout.
>
> The sale runs until [Date] at midnight. After that, prices go back to normal.
>
> **[Shop the sale →]**
>
> Not sure where to start? Our bestsellers are a good place:
>
> - [Product 1 name] — [short descriptor]
> - [Product 2 name] — [short descriptor]
> - [Product 3 name] — [short descriptor]
>
> Cheers,  
> [Brand name]

---

**CTA button:** `Shop the sale`  
**CTA URL:** `/sale`

---

### Email 2 — The value deepener

**Send:** Day 2 (non-purchasers only)  
**Goal:** Give them more reason to buy — social proof, pairings, more product context  
**Subject:** `What people are saying about our most popular wines`  
**Preview text:** `The sale is still on — here's what's flying off the shelves.`

---

**Body copy:**

> Hi [First name],
>
> The sale is still running — and a few bottles are already getting low. Here's what people are loving right now:
>
> ---
>
> **[Product name]**  
> *"[Customer review — 1–2 sentences. Keep it genuine and specific.]"*  
> — [Customer first name], [City]
>
> ---
>
> **[Product name]**  
> *"[Customer review]"*  
> — [Customer first name], [City]
>
> ---
>
> The [X]% discount is still live — no code needed at checkout.
>
> **[Browse the sale →]**
>
> Cheers,  
> [Brand name]

---

**CTA button:** `Browse the sale`  
**CTA URL:** `/sale`

---

### Email 3 — Mid-campaign reminder

**Send:** Day 5 (non-purchasers only)  
**Goal:** Keep the offer front of mind without feeling pushy  
**Subject:** `2 days left — a few things still in stock`  
**Preview text:** `Stock is moving. Here's what's still available before the sale ends.`

---

**Body copy:**

> Hi [First name],
>
> Quick heads up — the sale ends in 2 days and a few of our most popular bottles are running low.
>
> Here's what's still available:
>
> - [Product 1 — with stock note e.g. "Only 12 left"]
> - [Product 2 — with stock note]
> - [Product 3]
>
> Everything is still [X]% off. No code — just add to basket.
>
> **[Shop now →]**
>
> Cheers,  
> [Brand name]

---

**CTA button:** `Shop now`  
**CTA URL:** `/sale`

---

### Email 4 — Last chance

**Send:** Day 7, morning of expiry (non-purchasers only)  
**Goal:** Final conversion push with hard deadline  
**Subject:** `Last chance — sale ends tonight`  
**Preview text:** `After midnight, prices go back to normal. This is your last reminder.`

---

**Body copy:**

> Hi [First name],
>
> This is the last one — promise.
>
> The [X]% sale ends at midnight tonight. After that, prices go back to normal and we won't run another discount for a while.
>
> If you've been thinking about it, now's the time.
>
> **[Shop the sale — ends tonight →]**
>
> Cheers,  
> [Brand name]

---

**CTA button:** `Shop the sale — ends tonight`  
**CTA URL:** `/sale`

---

---

## 3. New vintage / release

**Type:** Product launch  
**Trigger:** New product added to catalogue  
**Audience:** VIP buyers first, then full active list  
**Duration:** 5 days  
**Emails:** 3  

### Flow

```
[New product added to catalogue]
       |
       v
[Email 1 — Day 0: Early access to VIP segment]
       |
       v
[Wait 48 hours]
       |
       v
[Email 2 — Day 2: General list announcement]
       |
       v
[Did they purchase?]
   YES --> exit
   NO  -->
       |
       v
[Email 3 — Day 5: "Still a few bottles left" nudge]
```

---

### Email 1 — VIP early access

**Send:** Day 0, to VIP/loyal buyer segment only  
**Goal:** Reward loyal customers with first access, create exclusivity  
**Subject:** `You get first look — new arrival`  
**Preview text:** `We're opening this to our best customers before anyone else. Here's what just arrived.`

---

**Body copy:**

> Hi [First name],
>
> Before we announce this to everyone else, we wanted to let you know first.
>
> We've just taken delivery of **[Wine name]** — a [vintage year] [grape variety] from [region / producer]. We've been waiting on this one for a while.
>
> **Tasting notes:**  
> [2–3 sentences. Be specific and vivid — aroma, palate, finish. Avoid clichés like "smooth" or "fruity".]
>
> **Why we love it:**  
> [1–2 sentences on what makes this wine interesting — the producer's story, the terroir, the method, or why this vintage is special.]
>
> **Pairs well with:** [Food pairing suggestion]
>
> We have [X] cases. Early access is yours until [date/time] — after that, we'll open it to the full list.
>
> **[Reserve a bottle →]**
>
> Cheers,  
> [Brand name]

---

**CTA button:** `Reserve a bottle`  
**CTA URL:** `/wines/[product-slug]`

---

### Email 2 — General list announcement

**Send:** Day 2, to full active subscriber list  
**Goal:** Announce the new arrival broadly and drive purchases  
**Subject:** `New in: [Wine name], [Vintage year]`  
**Preview text:** `Just arrived. Here's everything you need to know about our latest addition.`

---

**Body copy:**

> Hi [First name],
>
> Something new just landed.
>
> **[Wine name]** — [Vintage year], [Region]
>
> [2–3 sentence description of the wine. Lead with the most compelling thing about it — the story, the taste, the rarity, the price-quality ratio.]
>
> **Tasting notes:** [Aroma] — [Palate] — [Finish]
>
> **Producer:** [Producer name and 1-sentence background]
>
> **Best with:** [Food pairing]
>
> **Price:** £[XX.XX] per bottle / £[XX.XX] for a case of 6
>
> **[Shop now →]**
>
> Cheers,  
> [Brand name]

---

**CTA button:** `Shop now`  
**CTA URL:** `/wines/[product-slug]`

---

### Email 3 — Stock nudge

**Send:** Day 5 (non-purchasers only)  
**Goal:** Drive remaining conversions with low-stock urgency  
**Subject:** `[Wine name] — only [X] bottles left`  
**Preview text:** `We didn't order much of this one. Once it's gone, it's gone.`

---

**Body copy:**

> Hi [First name],
>
> Just a quick note — we only have [X] bottles of [Wine name] left.
>
> We didn't order a huge quantity of this one intentionally. It's the kind of wine that's worth buying before it's gone rather than waiting until it is.
>
> [One sentence recap of why it's worth it — taste, producer, occasion.]
>
> **[Get yours before it sells out →]**
>
> Cheers,  
> [Brand name]

---

**CTA button:** `Get yours before it sells out`  
**CTA URL:** `/wines/[product-slug]`

---

---

## 4. Seasonal / occasion

**Type:** Date-based  
**Trigger:** Calendar event (e.g. Christmas, Valentine's Day, Easter, summer)  
**Audience:** Full list, or gift-buyer segment if available  
**Duration:** ~2 weeks before the occasion  
**Emails:** 3  

### Flow

```
[14 days before occasion]
       |
       v
[Email 1 — Occasion announcement + gift guide]
       |
       v
[7 days before occasion]
       |
       v
[Email 2 — "Still time to order" + delivery cutoff]
       |
       v
[2–3 days before occasion]
       |
       v
[Email 3 — Last chance + express delivery option]
```

---

### Email 1 — Occasion announcement

**Send:** 14 days before occasion  
**Goal:** Plant the idea early, position wine as the gift  
**Subject (Christmas example):** `Christmas wine sorted — our gift guide is here`  
**Preview text:** `From the crowd-pleaser to the showstopper. Something for everyone on your list.`

---

**Body copy:**

> Hi [First name],
>
> Christmas is closer than it looks.
>
> If you're buying wine as a gift this year — or stocking up for the table — we've put together a short guide to make it easy.
>
> ---
>
> **The crowd-pleaser**  
> [Product name] — [Brief descriptor]  
> *The one that works for everyone. Goes with the turkey, survives the table, pleases the in-laws.*  
> £[XX] | **[Shop →]**
>
> ---
>
> **The showstopper**  
> [Product name] — [Brief descriptor]  
> *For the person who knows their wine. Or the host who wants to look like they do.*  
> £[XX] | **[Shop →]**
>
> ---
>
> **The case deal**  
> [Case name or mixed case] — [Brief descriptor]  
> *Stock the table properly. Our [X]-bottle selection covers all bases.*  
> £[XX] | **[Shop →]**
>
> ---
>
> Order by [Date] for guaranteed delivery before Christmas.
>
> **[View full gift guide →]**
>
> Cheers,  
> [Brand name]

---

**CTA button:** `View full gift guide`  
**CTA URL:** `/gifts` or `/christmas`

---

### Email 2 — Delivery reminder

**Send:** 7 days before occasion (non-purchasers)  
**Goal:** Urgency via delivery cutoff, not discount  
**Subject:** `Order by [Date] for delivery before Christmas`  
**Preview text:** `One week to go. Standard delivery cutoff is [Date] — don't leave it too late.`

---

**Body copy:**

> Hi [First name],
>
> One week until Christmas. Standard delivery orders need to be placed by **[Date]** to arrive in time.
>
> If you ordered now, here's what would happen:
>
> - Order placed today
> - Dispatched within [X] working days
> - Arrives by [Date] — in time for [occasion]
>
> We pack everything carefully. No damaged bottles, no carrier bags — proper protective packaging.
>
> **[Order now — delivery guaranteed by Christmas →]**
>
> Cheers,  
> [Brand name]

---

**CTA button:** `Order now — guaranteed delivery`  
**CTA URL:** `/shop`

---

### Email 3 — Last chance

**Send:** 2–3 days before occasion (non-purchasers)  
**Goal:** Final push — offer express delivery as a solution  
**Subject:** `Still need a Christmas wine? Express delivery available`  
**Preview text:** `It's not too late. Order by [time] today and we'll get it there in time.`

---

**Body copy:**

> Hi [First name],
>
> Still sorting Christmas wine? You've got until **[time] today** to order with express delivery and get it there in time.
>
> Our express delivery options:
>
> - **Next day:** Order by [time] today — £[X]
> - **Named day:** Choose your delivery date at checkout
>
> If you're stuck on what to get, our most gifted bottle this year is [Product name] — [one line on why].
>
> **[Order with express delivery →]**
>
> Cheers,  
> [Brand name]

---

**CTA button:** `Order with express delivery`  
**CTA URL:** `/shop`

---

---

## 5. Re-engagement campaign

**Type:** Automated / retention  
**Trigger:** Subscriber has not opened an email or made a purchase in 60–90 days  
**Audience:** Lapsed / inactive contacts  
**Duration:** ~2 weeks  
**Emails:** 3  

### Flow

```
[Contact inactive for 60–90 days]
       |
       v
[Email 1 — "We miss you" — soft re-engagement]
       |
       v
[Did they open or click?]
   YES --> return to active list, pause sequence
   NO  -->
       |
       v
[Wait 5 days]
       |
       v
[Email 2 — Incentive offer]
       |
       v
[Did they open or click?]
   YES --> return to active list
   NO  -->
       |
       v
[Wait 7 days]
       |
       v
[Email 3 — "Should we say goodbye?" — final opt-in check]
       |
       v
[Did they engage?]
   YES --> return to active list
   NO  --> unsubscribe / suppress from future sends
```

---

### Email 1 — We miss you

**Send:** Day 0 (60–90 days after last engagement)  
**Goal:** Soft re-engagement. Low pressure, genuine tone  
**Subject:** `It's been a while`  
**Preview text:** `We noticed you haven't heard from us in a while. Here's what you've missed.`

---

**Body copy:**

> Hi [First name],
>
> It's been a little while since we last connected — and we wanted to check in.
>
> In case you missed it, here's what's been happening at [Brand name]:
>
> - We added [New arrival or collection] — [brief descriptor]
> - [Other notable update — e.g. new region, seasonal picks]
> - [Something useful — e.g. new pairing guide, blog post]
>
> If your tastes have changed or you're looking for something specific, just reply to this email and we'll help you find something you'll love.
>
> **[See what's new →]**
>
> Cheers,  
> [Brand name]

---

**CTA button:** `See what's new`  
**CTA URL:** `/shop`

---

### Email 2 — Incentive offer

**Send:** Day 5 (no engagement after email 1)  
**Goal:** Give them a concrete reason to come back  
**Subject:** `Here's [X]% off — just for coming back`  
**Preview text:** `We'd love to have you back. Use this code on your next order.`

---

**Body copy:**

> Hi [First name],
>
> We don't want to lose you — so here's a little something to say we'd love to have you back.
>
> **[X]% off your next order:**
>
> **Code: COMEBACK[X]**
>
> Valid for 7 days from today.
>
> If you've been meaning to try something new, this is a good time. Our current bestsellers:
>
> - [Product 1]
> - [Product 2]
> - [Product 3]
>
> **[Shop with your discount →]**
>
> Cheers,  
> [Brand name]

---

**CTA button:** `Shop with your discount`  
**CTA URL:** `/shop`

---

### Email 3 — Final opt-in check

**Send:** Day 12 (no engagement after emails 1 & 2)  
**Goal:** Last chance to re-engage — honest, low-pressure, no tricks  
**Subject:** `Should we say goodbye?`  
**Preview text:** `We don't want to clog your inbox. One click to stay, and we won't bother you again if you'd rather not.`

---

**Body copy:**

> Hi [First name],
>
> We've noticed you haven't opened our last few emails — which is completely fine. Inboxes get busy.
>
> We don't want to keep sending you things you don't want. So we'll make it simple:
>
> **[Yes, keep me subscribed →]** — You'll stay on our list and keep hearing from us.
>
> If we don't hear from you, we'll quietly remove you from our mailing list. No hard feelings — you can always re-subscribe if you change your mind.
>
> Either way, thanks for being part of [Brand name] at some point. It genuinely means a lot.
>
> Cheers,  
> [Brand name]

---

**CTA button:** `Yes, keep me subscribed`  
**CTA URL:** `/resubscribe?token=[subscriber_token]`

> **Note for dev:** Clicking this link should update the subscriber's `status` to `active` and reset their `last_engaged_at` timestamp.

---

---

## 6. Newsletter / content email

**Type:** Recurring  
**Trigger:** Scheduled send (weekly or monthly)  
**Audience:** All active subscribers  
**Duration:** One-off (no sequence)  
**Emails:** 1 per send  

### Flow

```
[Scheduled date arrives]
       |
       v
[Email sends to all active subscribers]
       |
       v
[Track: open rate, click rate, unsubscribes]
       |
       v
[Use engagement data to refine next month's content]
```

---

### Newsletter template

**Send:** Weekly or monthly, same day/time each period  
**Goal:** Stay top of mind, provide genuine value, build long-term brand loyalty  
**Subject examples:**
- `What we're drinking this [month]`
- `The wine that surprised us this week`
- `[Region] spotlight — why it's worth your attention`
- `Pairing guide: [Dish] + wine`

**Preview text:** Summarise the most interesting thing in the email in one line.

---

**Body copy template:**

> Hi [First name],
>
> **What we've been opening lately**
>
> [1–2 sentences about a wine the team has been enjoying. Keep it conversational — like a recommendation from a friend, not a product listing.]
>
> ---
>
> **[This month's feature: Region / Topic]**
>
> [3–5 sentences on a topic of genuine interest — a region, a grape variety, a production method, a myth debunked. Teach them something they didn't know. Avoid anything they could get from the back of a label.]
>
> ---
>
> **Pairing of the month**
>
> [Dish]: We'd go for [Wine] — [1-sentence reasoning].
>
> ---
>
> **New in stock**
>
> - [Product 1] — [one-line descriptor + price]
> - [Product 2] — [one-line descriptor + price]
>
> **[Browse all new arrivals →]**
>
> ---
>
> That's it from us this [month]. If you ever want a recommendation for a specific occasion or budget, just reply to this email — we read everything.
>
> Cheers,  
> [Founder name / Team name]  
> [Brand name]

---

**CTA button:** `Browse all new arrivals`  
**CTA URL:** `/new-in`

---

---

## Appendix — Key variables & placeholders

| Placeholder | Description |
|---|---|
| `[First name]` | Subscriber first name — personalisation token |
| `[Brand name]` | Wine seller brand name |
| `[Founder name]` | Name of the person signing off the email |
| `[Product name]` | Name of the wine being featured |
| `[Region]` | Wine region (e.g. Burgundy, Rioja, Barossa Valley) |
| `[Vintage year]` | Year of the wine |
| `[Grape variety]` | e.g. Pinot Noir, Chardonnay, Grenache |
| `[X]` | Discount percentage — set per campaign |
| `[Date]` | Specific date — e.g. delivery cutoff, offer expiry |
| `[subscriber_token]` | Unique token for re-subscribe link — generated per contact |

---

## Appendix — Recommended send times

| Campaign | Best day | Best time |
|---|---|---|
| Welcome email 1 | Immediately | — |
| Promotional launch | Tuesday or Wednesday | 9–11am |
| Seasonal campaign | Thursday | 9–11am |
| Re-engagement | Tuesday | 10am |
| Newsletter | Thursday or Friday | 8–10am |

> All times in the subscriber's local timezone where possible, otherwise use the seller's timezone.

---

## Appendix — Metrics to track per campaign

| Metric | Target benchmark |
|---|---|
| Open rate | 35–50% (welcome), 20–30% (general) |
| Click-through rate | 3–8% |
| Conversion rate | 1–3% per email |
| Unsubscribe rate | < 0.5% (flag if higher) |
| Revenue per email | Track per campaign — use as primary success metric |

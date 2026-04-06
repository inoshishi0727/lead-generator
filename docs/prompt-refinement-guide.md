# Email Prompt Refinement Guide

## Setup

1. Go to [claude.ai](https://claude.ai) and start a new conversation
2. Select **Claude Sonnet 4** (fast iteration). Use **Opus** only for final validation.
3. Paste the contents of `docs/email-prompt.md` as your first message with this intro:

---

> I'm refining an email generation system prompt for a cold outreach tool. The prompt instructs Claude to write as Rob, founder of Asterley Bros (English Vermouth/Amaro producer), emailing bars and restaurants to become stockists.
>
> Here's the current prompt:
>
> [paste full contents of docs/email-prompt.md here]

---

## Step 1: Generate Test Emails

Ask Claude to generate 5 test emails:

> Generate 5 test emails for these venue types:
> 1. A London cocktail bar with a strong Martini programme, contact name verified
> 2. A gastropub outside London, no contact name
> 3. A wine bar with a vermouth tap, contact name likely
> 4. A high-volume pub chain, no interesting menu
> 5. A hotel bar with a seasonal menu, contact name verified
>
> After generating, critique each email against the prompt rules. Flag any violations.

## Step 2: Identify Issues

Read each email and note what feels off. Common things to look for:

- **Too long/short** — should be 120-160 words
- **Wrong product** — Dispense in a Spritz, Asterley Original in a Negroni
- **Sounds AI-ish** — uses banned words, too polished, too many adjectives
- **Structure wrong** — CTA not on its own line, venue observation front-loaded
- **Voice off** — too corporate, too salesy, not enough personality
- **Banned words used** — check the "Do Not" list

## Step 3: Iterate

Read each email and tell Claude what's wrong. Be specific. Ask it to fix the prompt rules and regenerate. Example:

> Here's my review of the 5 test emails. Fix the prompt to prevent these issues, then regenerate all 5.
>
> **Issue 1: [Name the pattern].** [Describe what's wrong with examples from the emails.] Add a rule: [what the fix should be].
>
> **Issue 2: [Name the pattern].** [Description + examples.] Rewrite to [desired outcome].

Common issues to flag:

- **Crutch phrases** — same phrase in every email (e.g. "quite different from the classic styles" in all 5). Ask for variation rules.
- **Salesy language** — margin talk, "built for this venue," "performs well." Rob recommends to mates, he doesn't pitch to buyers.
- **Venue concept compliments** — "That's brilliant," "That's exactly the kind of programme." Rule: state what you saw, connect to product, no adjectives about their concept.
- **Weak CTAs** — "Happy to send a selection over?" is passive. Fix: "Can I send over a few samples for the team?"
- **Copywriter-smooth phrases** — "Timing feels perfect," "couldn't be better timing." Fix: "Good timing to try something new on the list."
- **Commercial outcome claims** — "do really well on food-led menus," "a great talking point." Fix: describe the serve, let the bartender decide.

Claude will update the prompt rules and regenerate. Keep going until all 5 sound like Rob actually typed them.

## Step 4: Test Edge Cases

Once the main 5 feel right, test tricky scenarios:

- No contact name, no enrichment data at all
- A venue outside London (should suggest sending samples, not visiting)
- A venue with nothing interesting on the menu (should say nothing about it)
- A follow-up email (step 2) referencing a previous subject line
- A venue that already stocks competitors

## Step 5: Validate with Opus

Switch to **Claude Opus** for a final check:

> Here's my refined prompt. Generate the same 5 venue types and critique ruthlessly. Are there any edge cases where this prompt would produce a bad email?

## Step 6: Export as Markdown

When the prompt is ready, ask Claude to output it as a clean `.md` file:

> Format the final prompt as a markdown file with the same heading structure as the original (## for sections, bullet lists for rules, > blockquotes for critical warnings, ### for benchmark emails). Output the full file so I can copy it cleanly.

## Step 7: Apply

Once you have the final `.md`:

- Send it to the dev team — they'll update the system with the new prompt

## Tips

- **Benchmark emails are the anchor** — they teach voice better than any rule. Add more if you have real emails Rob has sent that hit the right tone.
- **The edit_feedback system learns automatically** — every time you manually edit a draft in the Outreach tab and save, that correction is stored and injected into future prompts as few-shot examples.
- **Keep the banned words list updated** — when you spot a word Claude keeps using that doesn't sound like Rob, add it to the "Do Not" section.
- **Keep old versions** — save each refined prompt with a date so you can go back if something gets worse.

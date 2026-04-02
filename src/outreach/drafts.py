"""Anthropic Claude draft generation for outreach messages."""

from __future__ import annotations

from datetime import datetime
from pathlib import Path

import anthropic
import structlog

from src.config.loader import AppConfig, load_config
from src.db.models import Lead, OutreachChannel, OutreachMessage

log = structlog.get_logger()

TEMPLATES_DIR = Path(__file__).parent / "templates"

# Step-specific instructions injected into the template
STEP_INSTRUCTIONS: dict[int, str] = {
    1: (
        "STEP 1 (First touch): 120-160 words. Introduce who you are and why you're reaching out. "
        "Include a soft early CTA on its own line ('Can we send samples?' or similar). "
        "Mention the recommended products with a specific serve relevant to this venue and season. "
        "Weave in one genuine observation about the venue in the middle (not as the opening line). "
        "Close with a direct CTA: 'When's good?' or similar. "
        "Two CTAs total: one soft and early, one direct at the end."
    ),
    2: (
        "STEP 2 (Add value): 80-100 words. This is a follow-up in the SAME email thread. "
        "Do NOT re-introduce who you are. They already know from step 1. "
        "Add a second product, a new serve, or a specific angle not mentioned in the first email. "
        "Shorter, punchier. New information only. "
        "CTA: 'Happy to send samples of both. Let me know.' "
        "Subject: 'Re: [original subject from step 1]' "
        "Previous email subject was: {previous_subject}"
    ),
    3: (
        "STEP 3 (Seasonal/social proof): 80-110 words. Same email thread. "
        "Do NOT re-introduce who you are. "
        "Use seasonality ('Spring menus are being finalised across London right now') or "
        "social proof ('several independent restaurants have picked it up this season'). "
        "Can mention BiB here if relevant to the venue. "
        "CTA: 'Offer is always open. Happy to send samples whenever works.' "
        "Subject: 'Re: [original subject from step 1]' "
        "Previous email subject was: {previous_subject}"
    ),
    4: (
        "STEP 4 (Soft close): 50-90 words. Very short. Respectful. No new product info. "
        "Leave the door open. No guilt-tripping. No 'I haven't heard back' or 'I'm sure you're busy.' "
        "CTA: 'Just reply to this email and I'll get samples sent.' or 'Just let me know.' "
        "Same thread, subject: 'Re: [original subject from step 1]' "
        "Previous email subject was: {previous_subject}"
    ),
}

# Category-specific rules from the SDR Venue Category Taxonomy
CATEGORY_RULES: dict[str, str] = {
    "cocktail_bar": (
        "CATEGORY: Cocktail Bar. Lead with DISPENSE and SCHOFIELD'S. "
        "Tone: Bartender-to-bartender. Technical respect. Punchy, warm. "
        "CTA: Suggest dropping in for a drink and leaving samples. "
        "Greeting: 'Hi team' or first name. Sign-off: 'Cheers,'"
    ),
    "wine_bar": (
        "CATEGORY: Wine Bar. Lead with ESTATE, ROSÉ, ASTERLEY ORIGINAL. "
        "Tone: Sommelier-aware. Talk about grape base, low ABV, aperitivo culture. "
        "CTA: Suggest popping in and bringing bottles to taste. "
        "Greeting: 'Hi team' or first name. Sign-off: 'Cheers,' or 'All the best,'"
    ),
    "italian_restaurant": (
        "CATEGORY: Italian Restaurant / Aperitivo Bar. Lead with DISPENSE, ASTERLEY ORIGINAL, ESTATE. "
        "Tone: Respect the Italian tradition. Position as British counterpart, not replacement. "
        "Mention 'My wife is Sicilian and I inherited a family Amaro recipe' if natural. "
        "CTA: Suggest coming in for a meal and leaving samples. "
        "Greeting: 'Hi team' or first name. Sign-off: 'Cheers,'"
    ),
    "gastropub": (
        "CATEGORY: Gastropub. Lead with DISPENSE (highball with ginger ale) and ASTERLEY ORIGINAL. "
        "Tone: Casual, local, 'down the road' energy. Lead with simple serves. "
        "CTA: Suggest dropping in for a pint and bringing bottles. "
        "Greeting: 'Hi team' or first name. Sign-off: 'Cheers,'"
    ),
    "hotel_bar": (
        "CATEGORY: Hotel Bar. Lead with SCHOFIELD'S, DISPENSE, can mention full range. "
        "Tone: Slightly more polished. Mention programme fit, not just a single serve. "
        "CTA: Suggest coming in for a drink and discussing next menu rotation. "
        "Greeting: 'Hi team' or first name. Sign-off: 'Cheers,' or 'All the best,'"
    ),
    "bottle_shop": (
        "CATEGORY: Bottle Shop. Lead with full range, DISPENSE as hero. "
        "Tone: Local story, shelf appeal, customer curiosity. "
        "CTA: Suggest popping in, dropping off bottles, or Meet the Maker event. "
        "Greeting: 'Hi team' or first name. Sign-off: 'Cheers,'"
    ),
    "deli_farm_shop": (
        "CATEGORY: Deli / Farm Shop. Lead with full range, ASTERLEY ORIGINAL as entry point. "
        "Tone: Provenance, 'made in London', artisan credentials, gifting angle. "
        "CTA: Suggest dropping off samples and discussing gifting/shelf placement. "
        "Greeting: 'Hi team' or first name. Sign-off: 'Cheers,' or 'All the best,'"
    ),
    "events_catering": (
        "CATEGORY: Events & Contract Catering. Lead with ASTERLEY ORIGINAL (Spritz) and DISPENSE (Negroni). "
        "Tone: Professional. Talk about programme fit, margin, ease of serve. Mention BiB supply. "
        "CTA: Suggest a meeting or call to discuss supply. "
        "Greeting: 'Hi team'. Sign-off: 'All the best,'"
    ),
    "rtd": (
        "CATEGORY: RTD / White Label. Lead with bulk range and bespoke formulation capability. "
        "Tone: B2B production language. Volume, spec, consistency, partnership. "
        "CTA: Suggest a meeting to discuss capability and send samples. "
        "Greeting: 'Hi team' or founders by name. Sign-off: 'All the best,' or 'Best regards,'"
    ),
    "restaurant_groups": (
        "CATEGORY: Restaurant & Bar Groups. Lead with DISPENSE, SCHOFIELD'S, full range. "
        "Tone: More formal. Lead with range breadth, supply reliability, story. Mention wholesaler availability. "
        "CTA: Suggest a meeting with buyer/procurement team. "
        "Greeting: 'Hi team' or buyer name. Sign-off: 'All the best,'"
    ),
    "festival_operators": (
        "CATEGORY: Festival Bar Operators. Lead with ASTERLEY ORIGINAL (Spritz) and DISPENSE (highball). "
        "Tone: Volume, simplicity, margin, weather-proof serves. Mention BiB supply. "
        "CTA: Suggest a meeting or call to discuss supply before festival season. "
        "Greeting: 'Hi team'. Sign-off: 'Cheers,'"
    ),
    "cookery_schools": (
        "CATEGORY: Cookery Schools & Experiences. Lead with DISPENSE, SCHOFIELD'S, full range. "
        "Tone: Educational. Story, technique, versatility. Suggest dedicated class collaboration. "
        "CTA: Suggest dropping in with bottles and discussing collaboration. "
        "Greeting: 'Hi team'. Sign-off: 'Cheers,'"
    ),
    "corporate_gifting": (
        "CATEGORY: Corporate Gifting. Lead with full range, ASTERLEY ORIGINAL as most giftable. "
        "Tone: Gifting language. Shelf appeal, story, British provenance. Mention trade pricing. "
        "CTA: Suggest sending samples and discussing catalogue inclusion. "
        "Greeting: 'Hi team'. Sign-off: 'All the best,'"
    ),
    "membership_clubs": (
        "CATEGORY: Membership Clubs & Co-Working. Lead with DISPENSE, SCHOFIELD'S, ASTERLEY ORIGINAL. "
        "Tone: Slightly elevated. Story-led, unique, conversation-starting. "
        "CTA: Suggest coming in for a drink and bringing samples. "
        "Greeting: 'Hi team'. Sign-off: 'Cheers,' or 'All the best,'"
    ),
    "airlines_trains": (
        "CATEGORY: Airlines, Trains & Lounges. Lead with SCHOFIELD'S (Martini) and ASTERLEY ORIGINAL (Spritz). "
        "Tone: Most formal. British provenance, premium positioning, volume. Mention BiB for lounges. "
        "CTA: Suggest a meeting to discuss listing. "
        "Greeting: 'Dear team'. Sign-off: 'Best regards,'"
    ),
    "subscription_boxes": (
        "CATEGORY: Subscription Box Curators. Lead with full range, DISPENSE as hero. "
        "Tone: Discovery language. Story, uniqueness, subscriber appeal. "
        "CTA: Suggest sending samples and discussing featuring. "
        "Greeting: 'Hi team'. Sign-off: 'Cheers,'"
    ),
    "film_tv_theatre": (
        "CATEGORY: Film, TV & Theatre Production. Lead with full range as props/brands. "
        "Tone: Creative, casual. Visual appeal, 'real brand' credibility. "
        "CTA: Suggest sending bottles for reference library or prop supply. "
        "Greeting: 'Hi team'. Sign-off: 'Cheers,'"
    ),
    "yacht_charter": (
        "CATEGORY: Yacht & Private Charter. Lead with full range, premium positioning. "
        "Tone: Luxury language. British craft, premium quality, unique. "
        "CTA: Suggest sending samples to provisioning team. "
        "Greeting: 'Dear team'. Sign-off: 'Best regards,'"
    ),
    "luxury_food_retail": (
        "CATEGORY: Luxury Food Retail. Lead with full range. "
        "Tone: Most polished. Award-winning, provenance, range breadth, gifting. "
        "CTA: Suggest a meeting with the spirits/wine buyer. "
        "Greeting: 'Dear team'. Sign-off: 'Best regards,'"
    ),
    "grocery": (
        "CATEGORY: Grocery. Lead with ASTERLEY ORIGINAL and SCHOFIELD'S. "
        "Tone: Commercial. Rate of sale, margin, range fit, promotional support. "
        "CTA: Suggest a meeting with the buyer/category manager. "
        "Greeting: 'Dear team'. Sign-off: 'Best regards,'"
    ),
}


def _get_current_season() -> str:
    """Determine the current season for product/serve selection."""
    month = datetime.now().month
    if month == 1:
        return "January (low ABV focus)"
    elif 3 <= month <= 6:
        return "Spring/Summer"
    elif 7 <= month <= 8:
        return "High Summer"
    elif 9 <= month <= 12:
        return "Autumn/Winter"
    else:  # February
        return "Autumn/Winter"


def _load_template(channel: OutreachChannel, step: int = 1) -> str:
    """Load the appropriate message template."""
    if channel == OutreachChannel.EMAIL:
        filename = "email_template.txt"
    else:
        filename = "dm_template.txt"
    template_path = TEMPLATES_DIR / filename
    if template_path.exists():
        return template_path.read_text()
    return _default_template(channel)


def _default_template(channel: OutreachChannel) -> str:
    """Fallback template if file doesn't exist."""
    if channel == OutreachChannel.EMAIL:
        return """Write a professional but warm email from Rob Berry, co-founder of
Asterley Bros, to {business_name}. Asterley Bros handcrafts English
Vermouth, Amaro, and Aperitivo in South London.

Venue details:
- Name: {business_name}
- Category: {category}
- Location: {address}
- Website: {website}
- Rating: {rating} ({review_count} reviews)

The email should:
1. Reference something specific about the venue
2. Briefly introduce Asterley Bros and their craft spirits
3. Suggest a tasting or sample drop-off
4. Be concise (under 150 words)
5. Sound human and genuine, not salesy"""

    return """Write a short, friendly Instagram DM from Rob Berry of Asterley Bros
to @{instagram_handle}. Asterley Bros handcrafts English Vermouth, Amaro,
and Aperitivo in South London.

The message should:
1. Be casual and genuine (it's a DM, not an email)
2. Reference their profile or content
3. Mention Asterley Bros craft spirits briefly
4. Suggest connecting or sending samples
5. Be under 80 words"""


def _get_category_rules(venue_category: str) -> str:
    """Get category-specific guidance for the prompt."""
    return CATEGORY_RULES.get(venue_category, "")


class DraftGenerator:
    """Generates personalised outreach drafts using Anthropic Claude."""

    def __init__(self, config: AppConfig | None = None) -> None:
        self.config = config or load_config()
        self._client = anthropic.Anthropic()

    def _build_prompt(
        self,
        lead: Lead,
        channel: OutreachChannel,
        step: int = 1,
        previous_subject: str | None = None,
    ) -> str:
        """Build the generation prompt with lead context and enrichment data."""
        template = _load_template(channel, step)

        # Build step instructions
        step_tmpl = STEP_INSTRUCTIONS.get(step, STEP_INSTRUCTIONS[1])
        step_instructions = step_tmpl.format(previous_subject=previous_subject or "N/A")

        # Get category-specific rules
        venue_cat = ""
        if lead.enrichment and lead.enrichment.venue_category:
            venue_cat = lead.enrichment.venue_category.value
        category_rules = _get_category_rules(venue_cat)

        context = {
            "business_name": lead.business_name,
            "category": lead.category or "venue",
            "address": lead.address or "London",
            "website": lead.website or "N/A",
            "rating": lead.rating or "N/A",
            "review_count": lead.review_count or "N/A",
            "instagram_handle": lead.instagram_handle or lead.business_name,
            "venue_category": venue_cat,
            "business_summary": "",
            "context_notes": "",
            "why_asterley_fits": "",
            "drinks_programme": "",
            "lead_products": "",
            "tone_tier": "",
            "menu_fit": "",
            "contact_name": "",
            "contact_role": "",
            "contact_confidence": "",
            "current_season": _get_current_season(),
            "step_number": step,
            "step_instructions": step_instructions,
            "category_rules": category_rules,
        }

        if lead.enrichment:
            e = lead.enrichment
            context["business_summary"] = e.business_summary or ""
            context["context_notes"] = e.context_notes or ""
            context["why_asterley_fits"] = e.why_asterley_fits or ""
            context["drinks_programme"] = e.drinks_programme or ""
            context["lead_products"] = ", ".join(e.lead_products) if e.lead_products else ""
            context["tone_tier"] = e.tone_tier.value if e.tone_tier else ""
            context["menu_fit"] = e.menu_fit.value if e.menu_fit else ""
            if e.contact:
                context["contact_name"] = e.contact.name or ""
                context["contact_role"] = e.contact.role or ""
                context["contact_confidence"] = e.contact.confidence or ""

        return template.format(**context)

    def generate_draft(
        self,
        lead: Lead,
        channel: OutreachChannel,
        step: int = 1,
        previous_subject: str | None = None,
    ) -> OutreachMessage:
        """Generate a single outreach draft using Claude."""
        prompt = self._build_prompt(lead, channel, step=step, previous_subject=previous_subject)

        response = self._client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}],
        )

        content = response.content[0].text
        subject = None

        # Extract subject line for emails
        if channel == OutreachChannel.EMAIL and "Subject:" in content:
            lines = content.split("\n")
            for i, line in enumerate(lines):
                if line.strip().startswith("Subject:"):
                    subject = line.strip().replace("Subject:", "").strip()
                    content = "\n".join(lines[i + 1 :]).strip()
                    break

        message = OutreachMessage(
            lead_id=lead.id,
            channel=channel,
            subject=subject,
            content=content,
            step_number=step,
        )

        log.info(
            "draft_generated",
            lead=lead.business_name,
            channel=channel.value,
            step=step,
            length=len(content),
        )
        return message

    def generate_followup_draft(
        self,
        lead: Lead,
        channel: OutreachChannel,
        step: int,
        previous_subject: str,
    ) -> OutreachMessage:
        """Generate a follow-up draft (steps 2-4)."""
        return self.generate_draft(
            lead, channel, step=step, previous_subject=previous_subject,
        )

    def generate_drafts(
        self,
        leads: list[Lead],
        channel: OutreachChannel | None = None,
    ) -> list[OutreachMessage]:
        """Generate drafts for multiple leads."""
        messages = []
        for lead in leads:
            ch = channel
            if ch is None:
                ch = (
                    OutreachChannel.INSTAGRAM_DM
                    if lead.source.value == "instagram"
                    else OutreachChannel.EMAIL
                )
            msg = self.generate_draft(lead, ch)
            messages.append(msg)
        return messages

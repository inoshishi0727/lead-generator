/**
 * Direct Firestore reads for deployed frontend (no backend needed).
 * Falls back to backend API when NEXT_PUBLIC_API_URL is set (local dev).
 */
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  orderBy,
  limit as fbLimit,
  updateDoc,
  addDoc,
  deleteDoc,
} from "firebase/firestore";
import { db } from "./firebase";
import type { Lead, LeadDetail, OutreachMessage, InboundReply } from "./types";

// --- Leads ---

export async function getLeads(filters?: {
  source?: string;
  stage?: string;
  search?: string;
}): Promise<Lead[]> {
  const ref = collection(db, "leads");
  const constraints: any[] = [];

  if (filters?.source && filters.source !== "All") {
    const sourceVal = filters.source === "Google Maps" ? "google_maps" : filters.source.toLowerCase();
    constraints.push(where("source", "==", sourceVal));
  }
  if (filters?.stage && filters.stage !== "All") {
    constraints.push(where("stage", "==", filters.stage));
  }

  const q = constraints.length > 0 ? query(ref, ...constraints) : ref;
  const snap = await getDocs(q);

  let results: Lead[] = snap.docs.map((d) => {
    const data = d.data();
    const enrichment = data.enrichment || {};
    const contact = enrichment.contact || {};
    return {
      id: data.id || d.id,
      business_name: data.business_name || "",
      address: data.address || null,
      phone: data.phone || null,
      website: data.website || null,
      email: data.email || null,
      email_found: data.email_found || false,
      source: data.source || null,
      stage: data.stage || null,
      rating: data.rating || null,
      review_count: data.review_count || null,
      category: data.category || null,
      scraped_at: data.scraped_at || null,
      score: data.score || null,
      venue_category: enrichment.venue_category || null,
      menu_fit: enrichment.menu_fit || null,
      tone_tier: enrichment.tone_tier || null,
      lead_products: enrichment.lead_products || [],
      enrichment_status: enrichment.enrichment_status || null,
      context_notes: enrichment.context_notes || null,
      business_summary: enrichment.business_summary || null,
      drinks_programme: enrichment.drinks_programme || null,
      why_asterley_fits: enrichment.why_asterley_fits || null,
      opening_hours_summary: enrichment.opening_hours_summary || null,
      price_tier: enrichment.price_tier || null,
      menu_fit_signals: enrichment.menu_fit_signals || [],
      menu_url: enrichment.menu_url || null,
      ai_approval: enrichment.ai_approval || null,
      ai_approval_reason: enrichment.ai_approval_reason || null,
      google_maps_place_id: data.google_maps_place_id || null,
      location_postcode: data.location_postcode || null,
      location_city: data.location_city || null,
      location_area: data.location_area || enrichment.location_area || null,
      contact_name: data.contact_name || contact.name || null,
      contact_email: data.contact_email || null,
      contact_role: data.contact_role || contact.role || null,
      contact_confidence: data.contact_confidence || contact.confidence || null,
      email_domain: data.email_domain || null,
      client_status: data.client_status || null,
      rejection_reason: data.rejection_reason || null,
      rejection_notes: data.rejection_notes || null,
      batch_id: data.batch_id || null,
      human_takeover: data.human_takeover || false,
      human_takeover_at: data.human_takeover_at || null,
      outcome: data.outcome || null,
      outcome_updated_at: data.outcome_updated_at || null,
      reply_count: data.reply_count || 0,
    };
  });

  if (filters?.search) {
    const s = filters.search.toLowerCase();
    results = results.filter((l) => l.business_name.toLowerCase().includes(s));
  }

  return results;
}

export async function getLeadById(id: string): Promise<Lead | null> {
  const ref = doc(db, "leads", id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const data = snap.data();
  const enrichment = data.enrichment || {};
  const contact = enrichment.contact || {};
  return {
    id: data.id || snap.id,
    business_name: data.business_name || "",
    address: data.address || null,
    phone: data.phone || null,
    website: data.website || null,
    email: data.email || null,
    email_found: data.email_found || false,
    source: data.source || null,
    stage: data.stage || null,
    rating: data.rating || null,
    review_count: data.review_count || null,
    category: data.category || null,
    scraped_at: data.scraped_at || null,
    score: data.score || null,
    venue_category: enrichment.venue_category || null,
    menu_fit: enrichment.menu_fit || null,
    tone_tier: enrichment.tone_tier || null,
    lead_products: enrichment.lead_products || [],
    enrichment_status: enrichment.enrichment_status || null,
    context_notes: enrichment.context_notes || null,
    business_summary: enrichment.business_summary || null,
    drinks_programme: enrichment.drinks_programme || null,
    why_asterley_fits: enrichment.why_asterley_fits || null,
    opening_hours_summary: enrichment.opening_hours_summary || null,
    price_tier: enrichment.price_tier || null,
    menu_fit_signals: enrichment.menu_fit_signals || [],
    menu_url: enrichment.menu_url || null,
    ai_approval: enrichment.ai_approval || null,
    ai_approval_reason: enrichment.ai_approval_reason || null,
    google_maps_place_id: data.google_maps_place_id || null,
    location_postcode: data.location_postcode || null,
    location_city: data.location_city || null,
    location_area: data.location_area || enrichment.location_area || null,
    contact_name: data.contact_name || contact.name || null,
    contact_email: data.contact_email || null,
    contact_role: data.contact_role || contact.role || null,
    contact_confidence: data.contact_confidence || contact.confidence || null,
    email_domain: data.email_domain || null,
    client_status: data.client_status || null,
    rejection_reason: data.rejection_reason || null,
    rejection_notes: data.rejection_notes || null,
    batch_id: data.batch_id || null,
    human_takeover: data.human_takeover || false,
    human_takeover_at: data.human_takeover_at || null,
    outcome: data.outcome || null,
    outcome_updated_at: data.outcome_updated_at || null,
    reply_count: data.reply_count || 0,
  };
}

// --- Outreach Messages ---

export async function getOutreachMessages(filters?: {
  status?: string;
  channel?: string;
  lead_id?: string;
  limit?: number;
}): Promise<OutreachMessage[]> {
  const ref = collection(db, "outreach_messages");
  const constraints: any[] = [];

  if (filters?.status) constraints.push(where("status", "==", filters.status));
  if (filters?.channel) constraints.push(where("channel", "==", filters.channel));
  if (filters?.lead_id) constraints.push(where("lead_id", "==", filters.lead_id));

  const q = constraints.length > 0 ? query(ref, ...constraints) : ref;
  const snap = await getDocs(q);

  const results: OutreachMessage[] = snap.docs.map((d) => {
    const data = d.data();
    return {
      id: data.id || d.id,
      lead_id: data.lead_id || "",
      business_name: data.business_name || "",
      venue_category: data.venue_category || null,
      channel: data.channel || "email",
      subject: data.subject || null,
      content: data.content || "",
      status: data.status || "draft",
      step_number: data.step_number || 1,
      created_at: data.created_at || null,
      tone_tier: data.tone_tier || null,
      lead_products: data.lead_products || [],
      contact_name: data.contact_name || null,
      context_notes: data.context_notes || null,
      menu_fit: data.menu_fit || null,
      menu_url: data.menu_url || null,
      recipient_email: data.recipient_email || null,
      website: data.website || null,
      original_content: data.original_content || undefined,
      original_subject: data.original_subject || undefined,
      was_edited: data.was_edited || false,
      edited_at: data.edited_at || null,
      rejection_reason: data.rejection_reason || null,
      has_reply: data.has_reply || false,
      reply_count: data.reply_count || 0,
      sent_at: data.sent_at || null,
    };
  });

  // Sort by created_at desc
  results.sort((a, b) => {
    const da = a.created_at || "";
    const db_ = b.created_at || "";
    return db_ > da ? 1 : db_ < da ? -1 : 0;
  });

  const lim = filters?.limit ?? 200;
  return results.slice(0, lim);
}

// --- Update lead fields ---

export async function updateLeadFields(
  leadId: string,
  updates: Record<string, unknown>
): Promise<void> {
  const ref = doc(db, "leads", leadId);
  await updateDoc(ref, updates);
}

// --- Update message status (approve/reject) ---

export async function updateOutreachMessage(
  messageId: string,
  updates: {
    status?: string;
    content?: string;
    subject?: string;
    rejection_reason?: string;
    lead_id?: string;
  }
): Promise<void> {
  const ref = doc(db, "outreach_messages", messageId);

  // Capture edit feedback as a diff when content is modified
  if (updates.content) {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data();
      const original = data.original_content || data.content;
      if (original && original !== updates.content) {
        const feedbackRef = collection(db, "edit_feedback");
        await addDoc(feedbackRef, {
          message_id: messageId,
          lead_id: data.lead_id || null,
          channel: data.channel || null,
          venue_category: data.venue_category || null,
          tone_tier: data.tone_tier || null,
          step_number: data.step_number || null,
          lead_products: data.lead_products || [],
          original_content: original,
          edited_content: updates.content,
          original_subject: data.original_subject || null,
          edited_subject: updates.subject || null,
          created_at: new Date().toISOString(),
        });

        (updates as Record<string, unknown>).was_edited = true;
        (updates as Record<string, unknown>).edited_at = new Date().toISOString();
      }
    }
  }

  // Handle rejection variants — update lead based on rejection_reason
  if (updates.status === "rejected" && updates.rejection_reason && updates.lead_id) {
    const reason = updates.rejection_reason;
    const leadRef = doc(db, "leads", updates.lead_id);

    if (reason === "snoozed") {
      const now = new Date();
      const daysUntilMonday = (8 - now.getDay()) % 7 || 7;
      const nextMonday = new Date(now);
      nextMonday.setDate(now.getDate() + daysUntilMonday);
      nextMonday.setHours(9, 0, 0, 0);
      await updateDoc(leadRef, {
        client_status: "snoozed",
        snoozed_until: nextMonday.toISOString(),
      });
    } else if (reason === "current_account") {
      await updateDoc(leadRef, {
        client_status: "current_account",
        stage: "declined",
      });
    } else if (reason === "in_discussion") {
      const snoozeUntil = new Date();
      snoozeUntil.setDate(snoozeUntil.getDate() + 60);
      await updateDoc(leadRef, {
        client_status: "in_discussion",
        snoozed_until: snoozeUntil.toISOString(),
      });
    }
  }

  // Strip lead_id (not a message field) but keep rejection_reason on the message doc
  const { lead_id: _leadId, ...messageUpdates } = updates;
  await updateDoc(ref, messageUpdates as Record<string, unknown>);
}

// --- Inbound Replies ---

export async function getInboundReplies(filters?: {
  lead_id?: string;
  matched?: boolean;
}): Promise<InboundReply[]> {
  const ref = collection(db, "inbound_replies");
  const constraints: any[] = [];

  if (filters?.lead_id) constraints.push(where("lead_id", "==", filters.lead_id));
  if (filters?.matched !== undefined) constraints.push(where("matched", "==", filters.matched));

  const q = constraints.length > 0 ? query(ref, ...constraints) : ref;
  const snap = await getDocs(q);

  const results: InboundReply[] = snap.docs.map((d) => {
    const data = d.data();
    return {
      id: data.id || d.id,
      lead_id: data.lead_id || null,
      message_id: data.message_id || null,
      from_email: data.from_email || "",
      from_name: data.from_name || null,
      subject: data.subject || null,
      body: data.body || "",
      source: data.source || "manual",
      direction: data.direction || "inbound",
      matched: data.matched || false,
      created_at: data.created_at || "",
      forwarded_by: data.forwarded_by || null,
      sentiment: data.sentiment || null,
      sentiment_reason: data.sentiment_reason || null,
    };
  });

  results.sort((a, b) => (b.created_at > a.created_at ? 1 : -1));
  return results;
}

export async function deleteInboundReply(replyId: string): Promise<void> {
  const ref = doc(db, "inbound_replies", replyId);
  await deleteDoc(ref);
}

export async function deleteOutreachMessage(messageId: string): Promise<void> {
  const ref = doc(db, "outreach_messages", messageId);
  await deleteDoc(ref);
}

// --- Create a manual lead ---

export async function createLead(data: {
  business_name: string;
  website?: string | null;
  instagram_handle?: string | null;
}): Promise<string> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const ref = collection(db, "leads");
  const docRef = await addDoc(ref, {
    id,
    business_name: data.business_name.trim(),
    website: data.website || null,
    instagram_handle: data.instagram_handle || null,
    source: "manual",
    stage: "scraped",
    scraped_at: now,
    updated_at: now,
    email: null,
    email_found: false,
    phone: null,
    address: null,
    category: null,
    rating: null,
    review_count: null,
    score: null,
    enrichment: {},
    dedup_key: `manual|${data.business_name.trim().toLowerCase()}|`,
  });
  return docRef.id;
}

// --- Scrape Runs ---

export interface ScrapeRunRecord {
  id: string;
  source: string;
  query: string;
  leads_found: number;
  leads_new: number;
  status: "running" | "completed" | "failed";
  error: string | null;
  started_at: string;
  completed_at: string | null;
}

export async function getScrapeRuns(max = 10): Promise<ScrapeRunRecord[]> {
  const ref = collection(db, "scrape_runs");
  const q = query(ref, orderBy("started_at", "desc"), fbLimit(max));
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as ScrapeRunRecord);
}

export async function restoreOriginalEmail(messageId: string): Promise<void> {
  const ref = doc(db, "outreach_messages", messageId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const data = snap.data();
  const originalEmail = data._original_recipient_email;
  if (!originalEmail) return;

  // Restore email on the message
  await updateDoc(ref, { recipient_email: originalEmail });

  // Restore email on the lead too
  if (data.lead_id) {
    const leadRef = doc(db, "leads", data.lead_id);
    const leadSnap = await getDoc(leadRef);
    if (leadSnap.exists() && leadSnap.data()._original_email) {
      await updateDoc(leadRef, { email: leadSnap.data()._original_email });
    }
  }
}

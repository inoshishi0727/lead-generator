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
} from "firebase/firestore";
import { db } from "./firebase";
import type { Lead, LeadDetail, OutreachMessage } from "./types";

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
      batch_id: data.batch_id || null,
    };
  });

  if (filters?.search) {
    const s = filters.search.toLowerCase();
    results = results.filter((l) => l.business_name.toLowerCase().includes(s));
  }

  return results;
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
      recipient_email: data.recipient_email || null,
    };
  });

  // Sort by created_at desc
  results.sort((a, b) => {
    const da = a.created_at || "";
    const db_ = b.created_at || "";
    return db_ > da ? 1 : db_ < da ? -1 : 0;
  });

  const lim = filters?.limit ?? 50;
  return results.slice(0, lim);
}

// --- Update message status (approve/reject) ---

export async function updateOutreachMessage(
  messageId: string,
  updates: { status?: string; content?: string; subject?: string }
): Promise<void> {
  const ref = doc(db, "outreach_messages", messageId);
  await updateDoc(ref, updates);
}

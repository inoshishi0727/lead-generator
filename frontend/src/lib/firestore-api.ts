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
  onSnapshot,
} from "firebase/firestore";
import { db, auth } from "./firebase";
import type { Lead, LeadDetail, LinkedInEmployee, OutreachMessage, InboundReply, EditFeedback, ReflectionCategory, Campaign } from "./types";

// --- Leads ---

export async function getLeads(filters?: {
  source?: string;
  stage?: string;
  search?: string;
  assignedTo?: string;
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
  if (filters?.assignedTo) {
    constraints.push(where("assigned_to", "==", filters.assignedTo));
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
      instagram_handle: data.instagram_handle || null,
      instagram_followers: data.instagram_followers || null,
      instagram_bio: data.instagram_bio || null,
      twitter_handle: data.twitter_handle || null,
      facebook_url: data.facebook_url || null,
      tiktok_handle: data.tiktok_handle || null,
      youtube_url: data.youtube_url || null,
      social_media_scraped_at: data.social_media_scraped_at || null,
      linkedin_company_size: data.linkedin_company_size || null,
      linkedin_industry: data.linkedin_industry || null,
      // Location fields
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
      added_by_name: data.added_by_name || null,
      added_by_email: data.added_by_email || null,
      created_at: data.created_at || data.scraped_at || null,
      assigned_to: data.assigned_to || null,
      assigned_to_name: data.assigned_to_name || null,
      assigned_at: data.assigned_at || null,
      assigned_by: data.assigned_by || null,
      human_takeover: data.human_takeover || false,
      human_takeover_at: data.human_takeover_at || null,
      outcome: data.outcome || null,
      outcome_updated_at: data.outcome_updated_at || null,
      reply_count: data.reply_count || 0,
      last_opened_at: data.last_opened_at || null,
      open_count: data.open_count || 0,
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
    instagram_handle: data.instagram_handle || null,
    instagram_followers: data.instagram_followers || null,
    instagram_bio: data.instagram_bio || null,
    twitter_handle: data.twitter_handle || null,
    facebook_url: data.facebook_url || null,
    tiktok_handle: data.tiktok_handle || null,
    youtube_url: data.youtube_url || null,
    social_media_scraped_at: data.social_media_scraped_at || null,
    linkedin_company_size: data.linkedin_company_size || null,
    linkedin_industry: data.linkedin_industry || null,
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
    added_by_name: data.added_by_name || null,
    added_by_email: data.added_by_email || null,
    created_at: data.created_at || data.scraped_at || null,
    assigned_to: data.assigned_to || null,
    assigned_to_name: data.assigned_to_name || null,
    assigned_at: data.assigned_at || null,
    assigned_by: data.assigned_by || null,
    human_takeover: data.human_takeover || false,
    human_takeover_at: data.human_takeover_at || null,
    outcome: data.outcome || null,
    outcome_updated_at: data.outcome_updated_at || null,
    reply_count: data.reply_count || 0,
    last_opened_at: data.last_opened_at || null,
    open_count: data.open_count || 0,
  };
}

// --- Outreach Messages ---

export async function getOutreachMessages(filters?: {
  status?: string;
  channel?: string;
  lead_id?: string;
  campaign_id?: string;
  limit?: number;
  assignedTo?: string;
}): Promise<OutreachMessage[]> {
  const ref = collection(db, "outreach_messages");
  const constraints: any[] = [];

  if (filters?.status) constraints.push(where("status", "==", filters.status));
  if (filters?.channel) constraints.push(where("channel", "==", filters.channel));
  if (filters?.lead_id) constraints.push(where("lead_id", "==", filters.lead_id));
  if (filters?.campaign_id) constraints.push(where("campaign_id", "==", filters.campaign_id));
  if (filters?.assignedTo) constraints.push(where("assigned_to", "==", filters.assignedTo));

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
      follow_up_label: data.follow_up_label || null,
      scheduled_send_date: data.scheduled_send_date || null,
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
      email_message_id: data.email_message_id || undefined,
      opened: data.opened || false,
      opened_at: data.opened_at || null,
      open_count: data.open_count || 0,
      last_opened_at: data.last_opened_at || null,
      delivered: data.delivered || false,
      delivered_at: data.delivered_at || null,
      parent_email_message_id: data.parent_email_message_id || null,
      is_channel_escalation: data.is_channel_escalation || false,
      is_client_campaign: data.is_client_campaign || false,
      assigned_to: data.assigned_to || null,
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
        stage: "client",
        rejection_reason: null,
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
  if (updates.status === "approved") {
    const user = auth.currentUser;
    (messageUpdates as Record<string, unknown>).approved_by = user?.uid ?? null;
    (messageUpdates as Record<string, unknown>).approved_at = new Date().toISOString();
  }
  await updateDoc(ref, messageUpdates as Record<string, unknown>);
}

// --- Content quality rating ---

export type ContentRating = "great" | "good" | "not_interested";

export async function rateContent(
  messageId: string,
  rating: ContentRating | null,
  note?: string
): Promise<void> {
  const ref = doc(db, "outreach_messages", messageId);
  await updateDoc(ref, {
    content_rating: rating,
    content_rating_note: note ?? null,
    content_rated_at: rating ? new Date().toISOString() : null,
  });
}

// --- Edit Feedback / Reflections ---

export async function getWeeklyEdits(sinceDays = 7): Promise<EditFeedback[]> {
  const since = new Date();
  since.setDate(since.getDate() - sinceDays);
  const sinceISO = since.toISOString();

  // Simple query: fetch most recent edits, filter by date client-side.
  // Avoids composite index requirement (orderBy + where on created_at).
  const ref = collection(db, "edit_feedback");
  const q = query(ref, orderBy("created_at", "desc"), fbLimit(50));
  const snap = await getDocs(q);

  return snap.docs
    .map((d) => {
      const data = d.data();
      return {
        id: d.id,
        message_id: data.message_id || "",
        lead_id: data.lead_id || null,
        channel: data.channel || null,
        venue_category: data.venue_category || null,
        tone_tier: data.tone_tier || null,
        step_number: data.step_number || null,
        lead_products: data.lead_products || [],
        original_content: data.original_content || "",
        edited_content: data.edited_content || "",
        original_subject: data.original_subject || null,
        edited_subject: data.edited_subject || null,
        created_at: data.created_at || "",
        reflection_category: data.reflection_category || null,
        reflection_note: data.reflection_note || null,
        reflected_at: data.reflected_at || null,
      };
    })
    .filter((d) => d.created_at >= sinceISO);
}

export async function saveReflection(
  feedbackId: string,
  category: ReflectionCategory,
  note: string | null
): Promise<void> {
  const ref = doc(db, "edit_feedback", feedbackId);
  await updateDoc(ref, {
    reflection_category: category,
    reflection_note: note || null,
    reflected_at: new Date().toISOString(),
  });
}

export async function clearReflection(feedbackId: string): Promise<void> {
  const ref = doc(db, "edit_feedback", feedbackId);
  await updateDoc(ref, {
    reflection_category: null,
    reflection_note: null,
    reflected_at: null,
  });
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
      assigned_to: data.assigned_to || null,
    };
  });

  results.sort((a, b) => (b.created_at > a.created_at ? 1 : -1));
  return results;
}

export async function deleteInboundReply(replyId: string): Promise<void> {
  const ref = doc(db, "inbound_replies", replyId);
  await deleteDoc(ref);
}

export interface ReplyNotification {
  id: string;
  lead_id: string | null;
  from_name: string | null;
  from_email: string;
  business_name: string | null;
  created_at: string;
  matched: boolean;
}

export function watchRecentReplies(
  callback: (replies: ReplyNotification[]) => void,
  limit = 30
): () => void {
  const ref = collection(db, "inbound_replies");
  const q = query(ref, where("matched", "==", true), orderBy("created_at", "desc"), fbLimit(limit));
  return onSnapshot(q, (snap) => {
    callback(
      snap.docs
        .filter((d) => d.data().direction !== "outbound")
        .map((d) => {
          const data = d.data();
          return {
            id: d.id,
            lead_id: data.lead_id ?? null,
            from_name: data.from_name ?? null,
            from_email: data.from_email ?? "",
            business_name: data.business_name ?? data.from_name ?? null,
            created_at: data.created_at ?? "",
            matched: data.matched ?? false,
          };
        })
    );
  });
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

/** Real-time listener for the most recent scrape run (manual or scheduled). */
export function watchLatestScrapeRun(
  callback: (run: ScrapeRunRecord | null) => void
): () => void {
  const ref = collection(db, "scrape_runs");
  const q = query(ref, orderBy("started_at", "desc"), fbLimit(1));
  return onSnapshot(q, (snap) => {
    callback(snap.empty ? null : (snap.docs[0].data() as ScrapeRunRecord));
  });
}

// --- Pipeline Jobs ---

export interface PipelineJobRecord {
  id: string;
  type: string;
  status: "running" | "completed" | "failed" | "skipped";
  started_at: string;
  completed_at: string | null;
  result: Record<string, number | string> | null;
}

export async function getPipelineActivity(max = 10): Promise<PipelineJobRecord[]> {
  const ref = collection(db, "pipeline_jobs");
  const q = query(ref, orderBy("started_at", "desc"), fbLimit(max));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as PipelineJobRecord);
}

/** Real-time listener — fires whenever a pipeline job changes (e.g. running → completed). */
export function watchPipelineActivity(
  callback: (jobs: PipelineJobRecord[]) => void,
  max = 10
): () => void {
  const ref = collection(db, "pipeline_jobs");
  const q = query(ref, orderBy("started_at", "desc"), fbLimit(max));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as PipelineJobRecord));
  });
}

// --- Clients (current_account + converted) ---

export async function getClients(): Promise<Lead[]> {
  const [clientLeads, convertedLeads] = await Promise.all([
    getLeads({ stage: "client" }),
    getLeads({ stage: "converted" }),
  ]);
  const seen = new Set<string>();
  const merged: Lead[] = [];
  for (const l of [...clientLeads, ...convertedLeads]) {
    if (!seen.has(l.id)) {
      seen.add(l.id);
      merged.push(l);
    }
  }
  return merged.sort((a, b) => a.business_name.localeCompare(b.business_name));
}

// --- Campaigns ---

export async function getCampaigns(): Promise<Campaign[]> {
  const ref = collection(db, "campaigns");
  const q = query(ref, orderBy("created_at", "desc"), fbLimit(50));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Campaign));
}

export async function updateCampaign(id: string, data: Partial<Omit<Campaign, "id">>): Promise<void> {
  const ref = doc(db, "campaigns", id);
  await updateDoc(ref, data as Record<string, unknown>);
}

export async function bulkSetScheduledSendDate(messageIds: string[], sendDate: string): Promise<void> {
  await Promise.all(
    messageIds.map((id) =>
      updateDoc(doc(db, "outreach_messages", id), { scheduled_send_date: sendDate })
    )
  );
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

// --- Campaign Edit History ---

export interface CampaignEdit {
  id: string;
  edited_by: string;
  edited_by_name: string;
  edited_at: string;
  changes: Record<string, { before: unknown; after: unknown }>;
}

export async function getCampaignEditHistory(campaignId: string): Promise<CampaignEdit[]> {
  const ref = collection(db, "campaigns", campaignId, "campaign_edits");
  const q = query(ref, orderBy("edited_at", "desc"), fbLimit(50));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as CampaignEdit));
}

export async function addCampaignEditHistory(
  campaignId: string,
  changes: Record<string, { before: unknown; after: unknown }>,
  editedBy: string,
  editedByName: string
): Promise<void> {
  if (Object.keys(changes).length === 0) return;
  const histRef = collection(db, "campaigns", campaignId, "campaign_edits");
  await addDoc(histRef, {
    edited_by: editedBy,
    edited_by_name: editedByName,
    edited_at: new Date().toISOString(),
    changes,
  });
}

// --- Client Edit History ---

export interface ClientEdit {
  id: string;
  edited_by: string;
  edited_by_name: string;
  edited_at: string;
  changes: Record<string, { before: unknown; after: unknown }>;
}

export async function getClientEditHistory(leadId: string): Promise<ClientEdit[]> {
  const ref = collection(db, "leads", leadId, "client_edits");
  const q = query(ref, orderBy("edited_at", "desc"), fbLimit(50));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ClientEdit));
}

export async function saveClientEdit(
  leadId: string,
  firestoreUpdates: Record<string, unknown>,
  changes: Record<string, { before: unknown; after: unknown }>,
  editedBy: string,
  editedByName: string
): Promise<void> {
  await updateLeadFields(leadId, firestoreUpdates);
  if (Object.keys(changes).length > 0) {
    const histRef = collection(db, "leads", leadId, "client_edits");
    await addDoc(histRef, {
      edited_by: editedBy,
      edited_by_name: editedByName,
      edited_at: new Date().toISOString(),
      changes,
    });
  }
}

// --- LinkedIn Employees ---

export async function getLinkedInEmployees(leadId: string): Promise<LinkedInEmployee[]> {
  const ref = collection(db, "linkedin_employees");
  const q = query(ref, where("lead_id", "==", leadId));
  const snap = await getDocs(q);

  const results: LinkedInEmployee[] = snap.docs.map((d) => {
    const data = d.data();
    return {
      id: data.id || d.id,
      lead_id: data.lead_id || "",
      company_linkedin_url: data.company_linkedin_url || null,
      source: data.source || "company_people",
      name: data.name || "",
      name_lower: data.name_lower || "",
      profile_url: data.profile_url || "",
      profile_slug: data.profile_slug || "",
      profile_image_url: data.profile_image_url || null,
      title: data.title || null,
      title_lower: data.title_lower || null,
      role_seniority: data.role_seniority || null,
      is_decision_maker: data.is_decision_maker || false,
      location: data.location || null,
      connection_degree: data.connection_degree || null,
      confidence: data.confidence || "high",
      scraped_at: data.scraped_at || "",
      last_seen_at: data.last_seen_at || "",
      promoted_to_outreach: data.promoted_to_outreach || false,
      promoted_at: data.promoted_at || null,
      notes: data.notes || null,
    };
  });

  results.sort((a, b) => {
    if (a.is_decision_maker !== b.is_decision_maker) return a.is_decision_maker ? -1 : 1;
    return a.name_lower.localeCompare(b.name_lower);
  });

  return results;
}

"use client";

import { useState } from "react";
import {
  Check,
  X,
  RefreshCw,
  Mail,
  MessageCircle,
  Pencil,
  Loader2,
  Clock,
  Send,
  ChevronDown,
  ChevronUp,
  Reply,
  User,
  MoreVertical,
  Trash2,
  Eye,
  EyeOff,
  CalendarClock,
} from "lucide-react";
import { EditMessageDialog } from "@/components/edit-message-dialog";
import { Card } from "@/components/ui/card";
import { OutreachTimeline } from "@/components/outreach-timeline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Menu, MenuTrigger, MenuContent, MenuItem } from "@/components/ui/menu";
import type { OutreachMessage } from "@/lib/types";
import {
  useUpdateMessage,
  useRegenerateMessage,
  useSendMessage,
  useDeleteMessage,
  useSendReply,
  useInboundReplies,
  useDeleteReply,
  useGenerateFollowupForLead,
  useMessages,
  DuplicateLiveOutreachError,
} from "@/hooks/use-outreach";
import { toast } from "sonner";
import { useGeneratingLeadId } from "@/hooks/use-live-updates";
import { useAuth } from "@/lib/auth-context";
import { useLeadDetail } from "@/hooks/use-lead-detail";

function ClaudeIcon({ className }: { className?: string }) {
  return (
    <svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path
        d="m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z"
        fill="currentColor"
      />
    </svg>
  );
}

function GeminiIcon({ className }: { className?: string }) {
  return (
    <svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path
        d="M11.04 19.32Q12 21.51 12 24q0-2.49.93-4.68.96-2.19 2.58-3.81t3.81-2.55Q21.51 12 24 12q-2.49 0-4.68-.93a12.3 12.3 0 0 1-3.81-2.58 12.3 12.3 0 0 1-2.58-3.81Q12 2.49 12 0q0 2.49-.96 4.68-.93 2.19-2.55 3.81a12.3 12.3 0 0 1-3.81 2.58Q2.49 12 0 12q2.49 0 4.68.96 2.19.93 3.81 2.55t2.55 3.81"
        fill="currentColor"
      />
    </svg>
  );
}

interface Props {
  message: OutreachMessage;
  inConversation?: boolean;
  emailCapReached?: boolean;
  isDuplicate?: boolean;
  defaultExpanded?: boolean;
}

const statusColors: Record<string, string> = {
  planned: "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300",
  draft: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  approved:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  rejected:
    "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  sent: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
};

const rejectionColors: Record<string, string> = {
  current_account: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  in_discussion: "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-400",
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

const REJECTION_LABELS: Record<string, string> = {
  snoozed: "Snoozed",
  current_account: "Current Account",
  in_discussion: "In Discussion",
};

function rejectionLabel(reason: string): string {
  return REJECTION_LABELS[reason] ?? "rejected";
}

export function MessageCard({ message, inConversation, emailCapReached, isDuplicate, defaultExpanded }: Props) {
  const [showTimeline, setShowTimeline] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [editSubject, setEditSubject] = useState("");
  const [rejectOpen, setRejectOpen] = useState(false);
  const [threadOpen, setThreadOpen] = useState(inConversation && !!message.has_reply);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState("");
  const [originalExpanded, setOriginalExpanded] = useState(defaultExpanded ?? false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleDay, setScheduleDay] = useState(() => message.scheduled_send_date?.slice(0, 10) ?? "");
  const [scheduleHour, setScheduleHour] = useState(() => {
    if (!message.scheduled_send_date) return "9";
    const h = new Date(message.scheduled_send_date).getHours();
    return String(h % 12 || 12);
  });
  const [scheduleMinute, setScheduleMinute] = useState(() => {
    if (!message.scheduled_send_date) return "00";
    return String(new Date(message.scheduled_send_date).getMinutes()).padStart(2, "0");
  });
  const [scheduleAmPm, setScheduleAmPm] = useState(() => {
    if (!message.scheduled_send_date) return "AM";
    return new Date(message.scheduled_send_date).getHours() >= 12 ? "PM" : "AM";
  });

  const { isAdmin, isMember } = useAuth();
  const canAct = isAdmin || isMember;
  const updateMutation = useUpdateMessage();
  const regenerateMutation = useRegenerateMessage();
  const sendMutation = useSendMessage();
  const deleteMutation = useDeleteMessage();
  const sendReplyMutation = useSendReply();
  const deleteReplyMutation = useDeleteReply();
  const generateFollowupMutation = useGenerateFollowupForLead();
  const generatingLeadId = useGeneratingLeadId();

  // Fetch original email for follow-ups
  const { data: leadMessages } = useMessages(
    { lead_id: message.lead_id },
    200,
  );
  const originalMessage = message.step_number > 1
    ? (leadMessages ?? []).find((m) => m.step_number === 1 && m.status === "sent")
      || (leadMessages ?? []).find((m) => m.step_number === 1)
    : null;

  const repliesQuery = useInboundReplies(
    { lead_id: message.lead_id },
    { enabled: threadOpen && !!message.has_reply }
  );
  const leadQuery = useLeadDetail(message.lead_id);
  const drinksProgramme = leadQuery.data?.drinks_programme ?? null;
  const replies = (repliesQuery.data ?? [])
    .sort((a, b) => (a.created_at > b.created_at ? 1 : -1));

  const ChannelIcon = message.channel === "email" ? Mail : MessageCircle;
  const isRegenerating = regenerateMutation.isPending || generatingLeadId === message.lead_id;

  function handleApprove() {
    if (emailCapReached && message.channel === "email") return;
    setActiveAction("approve");
    updateMutation.mutate(
      {
        id: message.id,
        status: "approved",
        lead_id: message.lead_id,
        step_number: message.step_number,
        channel: message.channel,
        business_name: message.business_name,
      },
      {
        onError: (err) => {
          if (err instanceof DuplicateLiveOutreachError) {
            toast.warning(`${err.businessName} already has a live email outreach — unapprove it first.`);
          }
        },
        onSettled: () => setActiveAction(null),
      }
    );
  }

  function handleReject(reason: string) {
    setRejectOpen(false);
    setActiveAction("reject");
    updateMutation.mutate({
      id: message.id,
      status: "rejected",
      rejection_reason: reason,
    }, {
      onSettled: () => setActiveAction(null),
    });
  }

  function handleUnapprove() {
    setActiveAction("unapprove");
    updateMutation.mutate({ id: message.id, status: "draft" }, {
      onSettled: () => setActiveAction(null),
    });
  }

  function handleBackToDraft() {
    setActiveAction("back-to-draft");
    updateMutation.mutate({ id: message.id, status: "draft", restore_original_email: message.status === "sent" }, {
      onSettled: () => setActiveAction(null),
    });
  }

  function handleRegenerate(provider: "claude" | "gemini" = "claude") {
    regenerateMutation.mutate({ id: message.id, provider });
  }

  async function handleGenerateFollowup() {
    try {
      setActiveAction("generate-followup");
      const res = await generateFollowupMutation.mutateAsync({ leadId: message.lead_id, force: false });
      // Inform the user that a planned follow-up was created and where to find it.
      // If the backend returned details about generation, surface them minimally.
      alert("Planned follow-up created — appears in Follow-ups tab");
    } catch (err: any) {
      console.error("Generate follow-up failed", err);
      // Surface a simple alert in the UI so the user sees the error when clicking the button.
      // In-app toast could be used instead if available.
      alert(`Generate follow-up failed: ${err?.message ?? String(err)}`);
    } finally {
      setActiveAction(null);
    }
  }

  function handleDialogSave(
    content: string,
    subject?: string,
    scheduledSendDate?: string | null
  ) {
    const updates: {
      id: string;
      content: string;
      subject?: string;
      scheduled_send_date?: string | null;
    } = {
      id: message.id,
      content,
    };
    if (subject !== undefined) updates.subject = subject;
    if (scheduledSendDate !== undefined) {
      updates.scheduled_send_date = scheduledSendDate;
    }
    const shouldCheckDueNow =
      message.status === "planned"
      && scheduledSendDate !== undefined
      && scheduledSendDate !== message.scheduled_send_date;
    updateMutation.mutate(updates, {
      onSuccess: () => {
        if (shouldCheckDueNow) {
          generateFollowupMutation.mutate({ leadId: message.lead_id, force: false });
        }
      },
    });
    setEditDialogOpen(false);
  }

  function startEditing() {
    setEditContent(message.content);
    setEditSubject(message.subject ?? "");
    setIsEditing(true);
  }

  function handleInlineSave() {
    handleDialogSave(
      editContent,
      message.channel === "email" ? editSubject : undefined
    );
    setIsEditing(false);
  }

  const isPending =
    updateMutation.isPending || regenerateMutation.isPending;

  return (
    <Card className={`transition-opacity ${isRegenerating ? "opacity-50" : ""}`} style={{ overflow: "visible" }}>
      {/* Sticky header — sticks to top of sp-email-detail scroll container */}
      <div
        className="sticky top-0 z-10 bg-card border-b flex flex-col"
        style={{ gap: 10, padding: "14px 16px 12px" }}
      >
        {/* Header row */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-sm">
            {message.business_name}
          </span>
          <Badge
            variant="outline"
            className={
              (message.status === "rejected" && message.rejection_reason
                ? rejectionColors[message.rejection_reason]
                : undefined) ?? statusColors[message.status] ?? ""
            }
          >
            {isRegenerating ? (
              <span className="flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                Regenerating
              </span>
            ) : message.status === "rejected" && message.rejection_reason ? (
              rejectionLabel(message.rejection_reason)
            ) : (
              message.status
            )}
          </Badge>
          <Badge variant="secondary" className="gap-1">
            <ChannelIcon className="h-3 w-3" />
            {message.channel === "email" ? "Email" : "DM"}
          </Badge>
          {isDuplicate && (
            <Badge
              variant="outline"
              className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 border-red-300 dark:border-red-700"
              title="Another live email outreach exists for this lead — unapprove or reject one to clear the duplicate."
            >
              Duplicate
            </Badge>
          )}
          {message.venue_category && (
            <Badge variant="secondary" className="capitalize">
              {message.venue_category.replace(/_/g, " ")}
            </Badge>
          )}
          {message.follow_up_label && message.follow_up_label !== "initial" && (
            <Badge variant="secondary" className="text-xs bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400">
              {message.follow_up_label}
            </Badge>
          )}
          {message.scheduled_send_date && (message.status === "draft" || message.status === "planned") && (
            <Badge variant="outline" className="text-xs gap-1">
              <Clock className="h-2.5 w-2.5" />
              Send by {message.scheduled_send_date}
            </Badge>
          )}
          {message.tone_tier && (
            <Badge variant="outline" className="capitalize text-xs">
              {message.tone_tier.replace(/_/g, " ")}
            </Badge>
          )}
          {message.was_edited && (
            <Badge variant="outline" className="gap-1 text-xs border-blue-500/30 text-blue-500">
              <Pencil className="h-2.5 w-2.5" />
              Edited
            </Badge>
          )}
          {message.has_reply && (
            <Badge
              variant="outline"
              className="gap-1 text-xs border-green-500/30 text-green-600 cursor-pointer hover:bg-green-50 dark:hover:bg-green-950/20 transition-colors"
              onClick={() => setThreadOpen((o) => !o)}
            >
              <Reply className="h-2.5 w-2.5" />
              {message.reply_count || 1} {(message.reply_count || 1) === 1 ? "reply" : "replies"}
              {threadOpen ? <ChevronUp className="h-2.5 w-2.5" /> : <ChevronDown className="h-2.5 w-2.5" />}
            </Badge>
          )}
          {/* Date/time */}
          {message.created_at && (
            <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              {formatDate(message.created_at)}
            </span>
          )}
          
          {/* Timeline toggle button */}
          <Button
            variant={showTimeline ? "secondary" : "outline"}
            size="sm"
            className={`h-6 px-2 text-[10px] ${!message.created_at ? 'ml-auto' : 'ml-1'}`}
            onClick={() => setShowTimeline(o => !o)}
            title="View schedule timeline"
          >
            <CalendarClock className="h-3 w-3 mr-1" />
            Timeline
          </Button>
        </div>
          {/* Render OutreachTimeline when toggled */}
          {showTimeline && <OutreachTimeline message={message} />}

        {/* Email tracking stats — sent messages only */}
        {message.status === "sent" && (
          <div className="flex items-center gap-4 text-xs">
            <div className={`flex items-center gap-1 ${message.opened ? "text-emerald-400" : "text-muted-foreground/50"}`}>
              {message.opened ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
              <span>{message.opened ? `Opened ${message.open_count || 1}x` : "Not opened"}</span>
            </div>
            {message.last_opened_at && (
              <div className="flex items-center gap-1 text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>Last {formatDate(message.last_opened_at)}</span>
              </div>
            )}
            {message.delivered && (
              <span className="text-muted-foreground/60">Delivered</span>
            )}
          </div>
        )}

        {/* Follow-up context — show previous emails in the sequence */}
        {message.step_number > 1 && (leadMessages ?? []).length > 0 && (() => {
          const previousMessages = (leadMessages ?? [])
            .filter((m) => m.step_number < message.step_number && m.id !== message.id && m.status === "sent")
            .sort((a, b) => a.step_number - b.step_number);
          if (previousMessages.length === 0) return null;
          return (
            <div className="rounded-md border border-border/30 bg-muted/20 overflow-hidden">
              <button
                onClick={() => setOriginalExpanded((o) => !o)}
                className="w-full flex items-center justify-between px-3 py-2 text-xs text-muted-foreground hover:bg-muted/30 transition-colors"
              >
                <span>
                  Follow-up #{message.step_number - 1} · {previousMessages.length} previous email{previousMessages.length !== 1 ? "s" : ""}
                </span>
                {originalExpanded
                  ? <ChevronUp className="h-3 w-3 shrink-0" />
                  : <ChevronDown className="h-3 w-3 shrink-0" />
                }
              </button>
              {originalExpanded && (
                <div className="border-t border-border/20">
                  {previousMessages.map((prev, i) => (
                    <div key={prev.id} className={`px-3 py-2 space-y-1 ${i > 0 ? "border-t border-border/10" : ""}`}>
                      <div className="flex items-center gap-2 text-xs">
                        <Badge variant="secondary" className="text-[9px]">
                          {prev.step_number === 1 ? "Original" : `Follow-up #${prev.step_number - 1}`}
                        </Badge>
                        <span className="font-medium text-foreground text-xs">{prev.subject || "No subject"}</span>
                        {prev.status === "sent" && prev.sent_at && (
                          <span className="text-muted-foreground">sent {formatDate(prev.sent_at)}</span>
                        )}
                        {prev.opened && (
                          <span className="text-emerald-400">opened {prev.open_count || 1}x</span>
                        )}
                        {prev.has_reply && (
                          <span className="text-blue-400">{prev.reply_count || 1} reply</span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground whitespace-pre-wrap bg-muted/30 rounded p-2 max-h-32 overflow-y-auto">
                        {prev.content}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })()}

        {/* Context row */}
        {(message.contact_name || message.context_notes || message.recipient_email || message.website) && (
          <div className="text-xs text-muted-foreground space-y-0.5">
            {message.recipient_email && (
              <p>
                To: <span className="font-medium text-foreground">{message.recipient_email}</span>
              </p>
            )}
            {message.website && (
              <p>
                Venue: <a href={message.website} target="_blank" rel="noopener noreferrer" className="font-medium text-blue-600 hover:underline dark:text-blue-400">{message.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}</a>
              </p>
            )}
            {message.menu_url && (
              <p>
                Menu: <a href={message.menu_url} target="_blank" rel="noopener noreferrer" className="font-medium text-emerald-600 hover:underline dark:text-emerald-400">{message.menu_url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}</a>
                {message.menu_fit && (
                  <span className={`ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    message.menu_fit === "strong" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" :
                    message.menu_fit === "moderate" ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300" :
                    "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                  }`}>
                    {message.menu_fit} fit
                  </span>
                )}
              </p>
            )}
            {!message.menu_url && (
              <p className="text-muted-foreground/60 text-sm">Menu: link not found</p>
            )}
            {message.contact_name && (
              <p>
                Contact: <span className="font-medium text-foreground">{message.contact_name}</span>
              </p>
            )}
            {message.context_notes && <p>{message.context_notes}</p>}
          </div>
        )}

        {/* Products */}
        {message.lead_products.length > 0 && (
          <div className="flex gap-1.5 flex-wrap">
            {message.lead_products.map((p) => (
              <Badge key={p} variant="outline" className="text-xs">
                {p}
              </Badge>
            ))}
          </div>
        )}

        {/* Drinks programme toggle */}
        <button
          className="flex w-full items-center justify-between rounded border border-border/60 bg-muted/20 px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted/40 transition-colors"
          onClick={() => setMenuOpen((o) => !o)}
        >
          <span className="flex items-center gap-1.5">
            🍸 Venue drinks programme
            {drinksProgramme && !menuOpen && (
              <span className="text-muted-foreground font-normal truncate max-w-[300px]">
                — {drinksProgramme.split(";")[0].trim()}{drinksProgramme.includes(";") ? ", ..." : ""}
              </span>
            )}
            {!drinksProgramme && !leadQuery.isLoading && (
              <span className="text-muted-foreground font-normal">— none scraped</span>
            )}
          </span>
          {menuOpen ? <ChevronUp className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
        </button>

        {menuOpen && (
          <div className="rounded border border-border bg-muted/20 p-2.5 text-xs text-muted-foreground">
            {leadQuery.isLoading ? (
              <span className="flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" /> Loading...
              </span>
            ) : drinksProgramme ? (
              <div className="flex flex-wrap gap-1">
                {drinksProgramme.split(";").map((item) => item.trim()).filter(Boolean).map((item) => (
                  <Badge key={item} variant="outline" className="text-[10px] font-normal">
                    {item}
                  </Badge>
                ))}
              </div>
            ) : (
              <span>No drinks programme scraped for this venue.</span>
            )}
          </div>
        )}

        {/* Subject (email only) */}
        {message.channel === "email" && (
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Subject</p>
            <p className="text-sm font-medium">
              {message.subject || "(no subject)"}
            </p>
          </div>
        )}
      </div>

      {/* Scrollable body — message content + action buttons */}
      <div className="space-y-3 p-4">

        {/* Subject input when editing */}
        {isEditing && message.channel === "email" && (
          <div>
            <p className="text-xs text-muted-foreground mb-1">Subject</p>
            <input
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              value={editSubject}
              onChange={(e) => setEditSubject(e.target.value)}
            />
          </div>
        )}

        {/* Message content */}
        <div>
          <div className="flex items-center justify-between mb-0.5">
            <p className="text-xs text-muted-foreground">Message</p>
            {isEditing && (
              <span className={`text-xs tabular-nums ${
                editContent.trim().split(/\s+/).length >= 60 && editContent.trim().split(/\s+/).length <= 160
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-amber-600 dark:text-amber-400"
              }`}>
                {editContent.trim().split(/\s+/).filter(Boolean).length} words (target: 60–160)
              </span>
            )}
          </div>
          {isEditing ? (
            <textarea
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-ring"
              rows={14}
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
            />
          ) : isRegenerating ? (
            <div className="flex items-center justify-center rounded bg-muted/30 p-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">Regenerating draft...</span>
            </div>
          ) : (
            <div className="whitespace-pre-wrap text-sm leading-relaxed rounded bg-muted/30 p-3">
              {message.content}
            </div>
          )}
        </div>

        {/* Inline edit save/cancel */}
        {isEditing && (
          <div className="flex gap-2 pt-1">
            <Button size="sm" onClick={handleInlineSave} disabled={isPending}>
              {isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
              Save Edit
            </Button>
            <Button size="sm" variant="outline" onClick={() => setIsEditing(false)} disabled={isPending}>
              Cancel
            </Button>
          </div>
        )}

        {/* Email thread */}
        {threadOpen && (
          <div className="space-y-2 border-t border-border pt-3">
            <p className="text-xs font-medium text-muted-foreground">Replies</p>

            {repliesQuery.isLoading ? (
              <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading replies...
              </div>
            ) : replies.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">No reply content found.</p>
            ) : (
              replies.map((reply, idx) => {
                const isOutbound = reply.direction === "outbound" || reply.source === "outbound_reply";
                return (
                  <div key={reply.id} className="flex gap-2">
                    <div className="flex flex-col items-center">
                      <div className={`flex h-6 w-6 items-center justify-center rounded-full ${
                        isOutbound ? "bg-blue-100 dark:bg-blue-900/40" : "bg-green-100 dark:bg-green-900/40"
                      }`}>
                        {isOutbound ? (
                          <Send className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                        ) : (
                          <User className="h-3 w-3 text-green-600 dark:text-green-400" />
                        )}
                      </div>
                      {idx < replies.length - 1 && (
                        <div className="mt-1 w-px flex-1 bg-border" />
                      )}
                    </div>
                    <div className="flex-1 pb-3">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">
                          {isOutbound ? "Rob" : (reply.from_name || reply.from_email)}
                        </span>
                        {!isOutbound && reply.from_name && (
                          <span>{reply.from_email}</span>
                        )}
                        <span>{formatDate(reply.created_at)}</span>
                        {reply.source === "manual" && (
                          <Badge variant="outline" className="text-[10px] px-1 py-0">manual</Badge>
                        )}
                        {isOutbound && (
                          <Badge variant="outline" className="text-[10px] px-1 py-0 border-blue-500/30 text-blue-500">sent</Badge>
                        )}
                        {!isOutbound && reply.sentiment && (
                          <Badge
                            variant="outline"
                            className={`text-[10px] px-1 py-0 ${
                              reply.sentiment === "positive"
                                ? "border-green-500/30 text-green-600 dark:text-green-400"
                                : reply.sentiment === "negative"
                                ? "border-red-500/30 text-red-600 dark:text-red-400"
                                : "border-gray-400/30 text-gray-500"
                            }`}
                            title={reply.sentiment_reason || undefined}
                          >
                            {reply.sentiment === "positive" ? "+" : reply.sentiment === "negative" ? "−" : "~"}{" "}
                            {reply.sentiment_reason || reply.sentiment}
                          </Badge>
                        )}
                        {canAct && !isOutbound && (
                          <Menu>
                            <MenuTrigger
                              render={
                                <button className="ml-auto rounded p-0.5 hover:bg-muted transition-colors">
                                  <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
                                </button>
                              }
                            />
                            <MenuContent side="bottom" align="end" sideOffset={4}>
                              <MenuItem
                                onClick={() => deleteReplyMutation.mutate(reply.id)}
                                className="text-red-600 dark:text-red-400"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                Delete reply
                              </MenuItem>
                            </MenuContent>
                          </Menu>
                        )}
                      </div>
                      <div className={`mt-1 whitespace-pre-wrap text-sm leading-relaxed rounded border p-2.5 ${
                        isOutbound
                          ? "bg-blue-50/50 dark:bg-blue-950/20 border-blue-200/30 dark:border-blue-800/30"
                          : "bg-green-50/50 dark:bg-green-950/20 border-green-200/30 dark:border-green-800/30"
                      }`}>
                        {reply.body || "(no content)"}
                      </div>
                    </div>
                  </div>
                );
              })
            )}

            {/* Reply input */}
            {canAct && message.status === "sent" && (
              <div className="flex gap-2 pt-2 border-t border-border">
                <textarea
                  className="flex-1 min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
                  placeholder="Type your reply..."
                  value={replyContent}
                  onChange={(e) => setReplyContent(e.target.value)}
                />
                <Button
                  size="sm"
                  className="self-end bg-blue-600 hover:bg-blue-700"
                  disabled={!replyContent.trim() || sendReplyMutation.isPending}
                  onClick={() => {
                    sendReplyMutation.mutate(
                      {
                        lead_id: message.lead_id,
                        message_id: message.id,
                        content: replyContent.trim(),
                      },
                      { onSuccess: () => setReplyContent("") }
                    );
                  }}
                >
                  {sendReplyMutation.isPending ? (
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="mr-1 h-3.5 w-3.5" />
                  )}
                  {sendReplyMutation.isPending ? "Sending..." : "Reply"}
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Action buttons */}
        {!isEditing && message.status === "planned" && canAct && (
          <div className="flex items-center gap-2 pt-1">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setEditDialogOpen(true)}
              disabled={isPending}
            >
              <Clock className="mr-1 h-3.5 w-3.5" />
              Edit Schedule
            </Button>

            {/* Generate a draft for planned follow-ups */}
            <Button
              size="sm"
              variant="ghost"
              className="text-orange-600 hover:text-orange-700 hover:bg-orange-500/10 dark:text-orange-400 dark:hover:text-orange-300 dark:hover:bg-orange-500/10"
              onClick={() => handleRegenerate("claude")}
              disabled={isPending || regenerateMutation.isPending}
            >
              {regenerateMutation.isPending ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <ClaudeIcon className="mr-1 h-3.5 w-3.5" />
              )}
              {regenerateMutation.isPending ? "Generating..." : "Regenerate with Claude"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-blue-600 hover:text-blue-700 hover:bg-blue-500/10 dark:text-blue-400 dark:hover:text-blue-300 dark:hover:bg-blue-500/10"
              onClick={() => handleRegenerate("gemini")}
              disabled={isPending || regenerateMutation.isPending}
            >
              {regenerateMutation.isPending ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <GeminiIcon className="mr-1 h-3.5 w-3.5" />
              )}
              {regenerateMutation.isPending ? "Generating..." : "Regenerate with Gemini"}
            </Button>

            {/* If a generated draft exists on a planned follow-up, allow Approve/Reject */}
            {message.content && message.content.trim() !== "" && (
              <>
                <Button
                  size="sm"
                  variant="default"
                  className="bg-emerald-600 hover:bg-emerald-700"
                  onClick={handleApprove}
                  disabled={isPending || (emailCapReached && message.channel === "email")}
                  title={emailCapReached && message.channel === "email" ? "20 emails already approved — unapprove or reject some first" : undefined}
                >
                  {activeAction === "approve" ? (
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="mr-1 h-3.5 w-3.5" />
                  )}
                  {activeAction === "approve" ? "Approving..." : "Approve"}
                </Button>

                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => setRejectOpen((v) => !v)}
                  disabled={isPending}
                >
                  {activeAction === "reject" ? (
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <X className="mr-1 h-3.5 w-3.5" />
                  )}
                  {activeAction === "reject" ? "Rejecting..." : "Reject"}
                </Button>
              </>
            )}
          </div>
        )}
        {!isEditing && message.status === "draft" && (
          <div className="flex items-center gap-2 pt-1">
            {canAct && (
              <Button
                size="sm"
                variant="default"
                className="bg-emerald-600 hover:bg-emerald-700"
                onClick={handleApprove}
                disabled={isPending || (emailCapReached && message.channel === "email")}
                title={emailCapReached && message.channel === "email" ? "20 emails already approved — unapprove or reject some first" : undefined}
              >
                {activeAction === "approve" ? (
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="mr-1 h-3.5 w-3.5" />
                )}
                {activeAction === "approve" ? "Approving..." : "Approve"}
              </Button>
            )}
            {canAct && (
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setRejectOpen((v) => !v)}
                disabled={isPending}
              >
                {activeAction === "reject" ? (
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <X className="mr-1 h-3.5 w-3.5" />
                )}
                {activeAction === "reject" ? "Rejecting..." : "Reject"}
              </Button>
            )}
            <Menu>
              <MenuTrigger
                disabled={isPending}
                render={
                  <Button size="sm" variant="outline" disabled={isPending}>
                    {isRegenerating ? (
                      <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="mr-1 h-3.5 w-3.5" />
                    )}
                    {isRegenerating ? "Regenerating..." : "Regenerate"}
                    <ChevronDown className="ml-0.5 h-3 w-3" />
                  </Button>
                }
              />
              <MenuContent side="bottom" align="start" sideOffset={4}>
                <MenuItem onClick={() => handleRegenerate("claude")}>
                  <ClaudeIcon className="h-3.5 w-3.5 text-orange-500" />
                  Regenerate with Claude
                </MenuItem>
                <MenuItem onClick={() => handleRegenerate("gemini")}>
                  <GeminiIcon className="h-3.5 w-3.5 text-blue-500" />
                  Regenerate with Gemini
                </MenuItem>
              </MenuContent>
            </Menu>
            <Button
              size="sm"
              variant="ghost"
              onClick={startEditing}
              disabled={isPending}
            >
              <Pencil className="mr-1 h-3.5 w-3.5" />
              Edit
            </Button>
            {canAct && (
              <Button
                size="sm"
                variant="ghost"
                className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                onClick={() => deleteMutation.mutate(message.id)}
                disabled={isPending || deleteMutation.isPending}
              >
                {deleteMutation.isPending ? (
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                )}
                {deleteMutation.isPending ? "Deleting..." : "Delete"}
              </Button>
            )}
          </div>
        )}
        {/* Edit + Send + Schedule + Unapprove buttons for approved messages */}
        {!isEditing && message.status === "approved" && canAct && (
          <div className="space-y-2 pt-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                size="sm"
                variant="outline"
                onClick={startEditing}
                disabled={sendMutation.isPending || updateMutation.isPending}
              >
                <Pencil className="mr-1 h-3.5 w-3.5" />
                Edit
              </Button>
              <Button
                size="sm"
                variant={scheduleOpen ? "default" : "outline"}
                onClick={() => setScheduleOpen((v) => !v)}
                disabled={updateMutation.isPending}
              >
                <CalendarClock className="mr-1 h-3.5 w-3.5" />
                {message.scheduled_send_date
                  ? `Scheduled ${new Date(message.scheduled_send_date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} ${new Date(message.scheduled_send_date).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`
                  : "Schedule"}
              </Button>
              {message.channel === "instagram_dm" ? (
                <Button
                  size="sm"
                  variant="default"
                  className="bg-amber-600 hover:bg-amber-700"
                  disabled
                  title="Instagram DMs must be sent manually. Copy the message and send via Instagram."
                >
                  <Send className="mr-1 h-3.5 w-3.5" />
                  Send Manually
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="default"
                  className="bg-blue-600 hover:bg-blue-700"
                  onClick={() => sendMutation.mutate(message.id)}
                  disabled={sendMutation.isPending || updateMutation.isPending}
                >
                  {sendMutation.isPending ? (
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="mr-1 h-3.5 w-3.5" />
                  )}
                  {sendMutation.isPending ? "Sending..." : "Send"}
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={handleUnapprove}
                disabled={updateMutation.isPending || sendMutation.isPending}
              >
                {activeAction === "unapprove" ? (
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <X className="mr-1 h-3.5 w-3.5" />
                )}
                {activeAction === "unapprove" ? "Unapproving..." : "Unapprove"}
              </Button>
            </div>
            {scheduleOpen && (
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="date"
                  value={scheduleDay}
                  onChange={(e) => setScheduleDay(e.target.value)}
                  min={new Date().toISOString().split("T")[0]}
                  className="rounded-md border border-input bg-background px-2 py-1 text-sm"
                />
                <select
                  value={scheduleHour}
                  onChange={(e) => setScheduleHour(e.target.value)}
                  className="rounded-md border border-input bg-background px-2 py-1 text-sm"
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
                    <option key={h} value={String(h)}>{String(h).padStart(2, "0")}</option>
                  ))}
                </select>
                <span className="text-sm text-muted-foreground">:</span>
                <input
                  type="number"
                  min={0}
                  max={59}
                  value={scheduleMinute}
                  onChange={(e) => {
                    const v = Math.max(0, Math.min(59, parseInt(e.target.value) || 0));
                    setScheduleMinute(String(v).padStart(2, "0"));
                  }}
                  className="w-14 rounded-md border border-input bg-background px-2 py-1 text-sm text-center"
                />
                <select
                  value={scheduleAmPm}
                  onChange={(e) => setScheduleAmPm(e.target.value)}
                  className="rounded-md border border-input bg-background px-2 py-1 text-sm"
                >
                  <option value="AM">AM</option>
                  <option value="PM">PM</option>
                </select>
                <Button
                  size="sm"
                  disabled={updateMutation.isPending || !scheduleDay}
                  onClick={() => {
                    let h = parseInt(scheduleHour);
                    if (scheduleAmPm === "PM" && h !== 12) h += 12;
                    if (scheduleAmPm === "AM" && h === 12) h = 0;
                    // Build a local Date from the picked values, then store as UTC ISO
                    const local = new Date(`${scheduleDay}T${String(h).padStart(2, "0")}:${scheduleMinute}:00`);
                    const iso = local.toISOString(); // always UTC
                    updateMutation.mutate(
                      { id: message.id, scheduled_send_date: iso },
                      { onSuccess: () => setScheduleOpen(false) }
                    );
                  }}
                >
                  {updateMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  Save
                </Button>
                {message.scheduled_send_date && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={updateMutation.isPending}
                    onClick={() => {
                      updateMutation.mutate(
                        { id: message.id, scheduled_send_date: null },
                        { onSuccess: () => { setScheduleDay(""); setScheduleOpen(false); } }
                      );
                    }}
                  >
                    Clear
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
        {/* Back to draft button for rejected messages */}
        {message.status === "rejected" && canAct && (
          <div className="flex items-center gap-2 pt-1">
            <Button
              size="sm"
              variant="outline"
              onClick={handleBackToDraft}
              disabled={updateMutation.isPending}
            >
              {activeAction === "back-to-draft" ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="mr-1 h-3.5 w-3.5" />
              )}
              {activeAction === "back-to-draft" ? "Restoring..." : "Back to Draft"}
            </Button>
          </div>
        )}
        {/* View Replies + Reset for sent messages — hidden in conversation view */}
        {message.status === "sent" && canAct && !inConversation && (
          <div className="flex items-center gap-2 pt-1">
            <Button
              size="sm"
              variant="outline"
              className="border-green-500 text-green-600 hover:bg-green-50 dark:hover:bg-green-950/20"
              onClick={() => setThreadOpen((o) => !o)}
              disabled={isPending}
            >
              <Reply className="mr-1 h-3.5 w-3.5" />
              {threadOpen ? "Hide Replies" : "View Replies"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleBackToDraft}
              disabled={updateMutation.isPending}
            >
              {activeAction === "back-to-draft" ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="mr-1 h-3.5 w-3.5" />
              )}
              {activeAction === "back-to-draft" ? "Restoring..." : "Back to Draft"}
            </Button>
            {!message.has_reply && (message.step_number ?? 1) < 4 && (
              <Button
                size="sm"
                variant="ghost"
                onClick={handleGenerateFollowup}
                  disabled={generateFollowupMutation.isPending || activeAction === "generate-followup"}
              >
                {generateFollowupMutation.isPending ? (
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="mr-1 h-3.5 w-3.5" />
                )}
                {generateFollowupMutation.isPending ? "Generating..." : "Generate Follow-up"}
              </Button>
            )}
          </div>
        )}
        {rejectOpen && (
          <div className="mt-3 border-t border-red-500/20 pt-3">
            <p className="text-xs text-red-400 mb-2">Why are you rejecting this draft?</p>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {[
                { value: "wrong_tone",    label: "Wrong tone" },
                { value: "wrong_product", label: "Wrong product" },
                { value: "not_suitable",  label: "Not suitable" },
                { value: "needs_edit",    label: "Needs editing" },
                { value: "other",         label: "Other" },
              ].map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => handleReject(value)}
                  className="rounded-full border border-red-500/30 px-2.5 py-0.5 text-xs text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setRejectOpen(false)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {editDialogOpen && (
        <EditMessageDialog
          message={message}
          onSave={handleDialogSave}
          onClose={() => setEditDialogOpen(false)}
        />
      )}
    </Card>
  );
}

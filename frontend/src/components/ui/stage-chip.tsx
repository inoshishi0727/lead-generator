type Stage = "new" | "contacted" | "replied" | "converted" | "rejected";

const LABELS: Record<Stage, string> = {
  new: "New",
  contacted: "Contacted",
  replied: "Replied",
  converted: "Converted",
  rejected: "Rejected",
};

export function StageChip({ stage }: { stage: Stage | string }) {
  const s = (stage ?? "new") as Stage;
  return (
    <span className={`sp-chip ${s}`}>
      <span className="sp-dot" />
      {LABELS[s] ?? stage}
    </span>
  );
}

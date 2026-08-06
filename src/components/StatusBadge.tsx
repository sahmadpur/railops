/** Turnaround status codes are editable data, so an unknown code stays neutral. */
const TONE: Record<string, string> = {
  open: "badge-warning",
  in_progress: "badge-info",
  completed: "badge-success",
  cancelled: "badge-danger",
};

export default function StatusBadge({ code, text }: { code: string; text?: string }) {
  return <span className={`badge ${TONE[code] ?? ""}`}>{text ?? code}</span>;
}

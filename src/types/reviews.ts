export type ReviewStatus = "llm_started" | "done" | "error" | "no_data" | string;

export type ReviewKind = "per_push" | "team_aggregate";

export type ReviewItem = {
  team_id: string;
  repo_name: string | null;
  commit_sha: string | null;
  /** Defaults to per_push when missing (older rows). */
  review_kind?: ReviewKind;
  status: ReviewStatus;
  push_summary: string | null;
  rag_level: string | null;
  structured_output: Record<string, unknown> | null;
  input_code_length: number | null;
  created_at: string;
  updated_at: string;
};

export function reviewKindOf(item: ReviewItem): ReviewKind {
  return item.review_kind === "team_aggregate" ? "team_aggregate" : "per_push";
}

export function isPerPushReview(item: ReviewItem): boolean {
  return reviewKindOf(item) === "per_push";
}

export type CriteriaComments = {
  R1_01?: string;
  R1_02?: string;
  R1_03?: string;
  R1_04?: string;
  R1_05?: string;
};

export function extractCriteriaComments(structuredOutput: Record<string, unknown> | null): CriteriaComments | null {
  if (!structuredOutput) return null;
  let value = structuredOutput.criteria_comments;
  if ((!value || typeof value !== "object") && structuredOutput.output && typeof structuredOutput.output === "object") {
    value = (structuredOutput.output as Record<string, unknown>).criteria_comments;
  }
  if (!value || typeof value !== "object") return null;
  return value as CriteriaComments;
}

/** Fields from LLM `overall_picture` (per-push & aggregate). */
export type OverallPicture = {
  project_about?: string;
  tools_plain_bullets?: string;
  current_focus?: string;
  architectural_style?: string;
  historical_synthesis?: string;
  evolution_notes?: string;
  push_summary?: string;
  significant_change?: boolean;
};

export function extractOverallPicture(structuredOutput: Record<string, unknown> | null): OverallPicture | null {
  if (!structuredOutput) return null;
  const direct = structuredOutput.overall_picture;
  if (direct && typeof direct === "object") return direct as OverallPicture;
  const nested = structuredOutput.output;
  if (nested && typeof nested === "object") {
    const op = (nested as Record<string, unknown>).overall_picture;
    if (op && typeof op === "object") return op as OverallPicture;
  }
  return null;
}

export type TeamLatestReview = {
  team_id: string;
  repo_name: string | null;
  commit_sha: string | null;
  status: ReviewStatus;
  push_summary: string | null;
  rag_level: string | null;
  updated_at: string;
};

export function shortSha(sha: string | null) {
  if (!sha) return "unknown";
  return sha.slice(0, 8);
}

export function toAbsoluteTime(value: string) {
  return new Date(value).toLocaleString();
}

export function toRelativeTime(value: string) {
  const now = Date.now();
  const then = new Date(value).getTime();
  const diffSec = Math.max(0, Math.floor((now - then) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

export function eventLabel(status: string) {
  if (status === "done") return "Review hoàn thành";
  if (status === "llm_started") return "AI đang xử lý";
  if (status === "error") return "Review lỗi";
  return "Sự kiện review";
}

export function fallbackSummary(status: string) {
  if (status === "done") return "Đã lưu kết quả review.";
  if (status === "llm_started") return "Đã nhận push; AI đang phân tích.";
  if (status === "error") return "Lỗi khi xử lý review.";
  return "Chưa có tóm tắt.";
}


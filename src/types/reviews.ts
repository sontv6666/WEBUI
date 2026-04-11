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
  const value = structuredOutput.criteria_comments;
  if (!value || typeof value !== "object") return null;
  return value as CriteriaComments;
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
  if (status === "done") return "AI review completed";
  if (status === "llm_started") return "AI review started";
  if (status === "error") return "AI review failed";
  return "Review event";
}

export function fallbackSummary(status: string) {
  if (status === "done") return "AI completed and stored the review output.";
  if (status === "llm_started") return "New push received. AI started analyzing this commit.";
  if (status === "error") return "AI encountered an issue while processing this commit.";
  return "No summary provided.";
}


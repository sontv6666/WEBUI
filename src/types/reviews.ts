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

function unwrapStructuredRoot(structuredOutput: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!structuredOutput) return null;
  if (
    structuredOutput.inventory_exhaustive != null ||
    structuredOutput.assessment != null ||
    structuredOutput.suggested_test_cases != null ||
    structuredOutput.suggested_questions_for_team != null ||
    structuredOutput.suggested_prompt_refinement != null
  ) {
    return structuredOutput;
  }
  const nested = structuredOutput.output;
  if (nested && typeof nested === "object") return nested as Record<string, unknown>;
  return structuredOutput;
}

export type InventoryExhaustive = {
  llm_models_and_apis?: string[];
  frameworks_and_runtimes?: string[];
  vector_databases?: string[];
  agent_orchestration?: string[];
  third_party_integrations?: string[];
};

export type AssessmentBlock = {
  advantages?: string;
  disadvantages?: string;
  context_and_fit?: string;
  source_structure?: string;
  completeness?: string;
  security?: string;
};

export function extractInventoryExhaustive(structuredOutput: Record<string, unknown> | null): InventoryExhaustive | null {
  const root = unwrapStructuredRoot(structuredOutput);
  const inv = root?.inventory_exhaustive;
  if (!inv || typeof inv !== "object") return null;
  return inv as InventoryExhaustive;
}

export function extractAssessment(structuredOutput: Record<string, unknown> | null): AssessmentBlock | null {
  const root = unwrapStructuredRoot(structuredOutput);
  const a = root?.assessment;
  if (!a || typeof a !== "object") return null;
  return a as AssessmentBlock;
}

export function extractSuggestedTestCases(structuredOutput: Record<string, unknown> | null): string[] | null {
  const root = unwrapStructuredRoot(structuredOutput);
  const t = root?.suggested_test_cases;
  if (!Array.isArray(t)) return null;
  return t.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
}

export function extractPromptRefinement(structuredOutput: Record<string, unknown> | null): string | null {
  const root = unwrapStructuredRoot(structuredOutput);
  const s = root?.suggested_prompt_refinement;
  if (typeof s !== "string" || !s.trim()) return null;
  return s.trim();
}

export function extractSuggestedQuestionsForTeam(structuredOutput: Record<string, unknown> | null): string[] | null {
  const root = unwrapStructuredRoot(structuredOutput);
  const t = root?.suggested_questions_for_team;
  if (!Array.isArray(t)) return null;
  return t.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
}

/** Khung test tối thiểu sinh từ inventory khi LLM chưa trả suggested_test_cases (bổ trợ trên UI). */
export function buildSkeletonTestCasesFromInventory(inv: InventoryExhaustive | null): string[] {
  if (!inv) return [];
  const out: string[] = [];
  const llm = inv.llm_models_and_apis ?? [];
  if (llm.length > 0) {
    out.push(
      `Given model/API đã cấu hình (${llm.slice(0, 4).join(", ")}), When gửi một prompt đại diện use-case chính của đội, Then phản hồi đúng định dạng và không lỗi 5xx/timeout bất thường.`
    );
  }
  const vd = inv.vector_databases ?? [];
  if (vd.length > 0) {
    out.push(
      `Given tài liệu mẫu đã ingest vào ${vd[0]}, When truy vấn semantic gần với đoạn đã index, Then trả chunk liên quan (và citation/trích dẫn nếu UI có).`
    );
  }
  const ag = inv.agent_orchestration ?? [];
  if (ag.length > 0) {
    out.push(
      `When chạy luồng agent (${ag[0]}), Then tool/route được gọi đúng và trạng thái không mất giữa các bước.`
    );
  }
  const fw = inv.frameworks_and_runtimes ?? [];
  if (fw.length > 0) {
    out.push(
      `Given khởi động dịch vụ (${fw.slice(0, 3).join(", ")}), When kiểm tra health/readiness hoặc smoke test API, Then trạng thái OK và log không báo lỗi cấu hình.`
    );
  }
  const tp = inv.third_party_integrations ?? [];
  if (tp.length > 0) {
    out.push(
      `Given tích hợp ${tp.slice(0, 2).join(", ")}, When thao tác đại diện (auth/callback/webhook tùy hệ), Then không lộ secret client-side và xử lý lỗi rõ ràng.`
    );
  }
  return out.slice(0, 8);
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


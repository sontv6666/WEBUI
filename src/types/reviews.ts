/** Khớp `check (status in ('llm_started', 'done', 'error'))` trên bảng `ai_reviews`. */
export type ReviewStatus = "llm_started" | "done" | "error" | string;

/**
 * Schema hiện tại (`20260410_reset_ai_reviews_full.sql`) không có cột `review_kind`;
 * chỉ giữ type này nếu sau này thêm lại hàng tổng hợp cấp team.
 */
export type ReviewKind = "per_push" | "team_aggregate";

export type ReviewItem = {
  id?: string;
  team_id: string;
  repo_name: string | null;
  commit_sha: string | null;
  review_kind?: ReviewKind;
  status: ReviewStatus;
  push_summary: string | null;
  rag_level: string | null;
  structured_output: Record<string, unknown> | null;
  input_code_length: number | null;
  /** Denormalized từ n8n / trigger; có thể null với dữ liệu cũ. */
  commits_in_batch?: number | null;
  batched_commit_shas?: string[] | null;
  created_at: string;
  updated_at: string;
};

export function reviewKindOf(item: ReviewItem): ReviewKind {
  return item.review_kind === "team_aggregate" ? "team_aggregate" : "per_push";
}

/** Nhãn tiếng Việt cho UI (không hiển thị chuỗi nội bộ `per_push` / `team_aggregate`). */
export function reviewKindLabelVi(kind: ReviewKind): string {
  if (kind === "team_aggregate") return "Tổng hợp đội";
  return "Theo push";
}

/** Mọi hàng trong DB reset hiện tại đều là bản ghi review theo commit. */
export function isPerPushReview(item: ReviewItem): boolean {
  return item.review_kind !== "team_aggregate";
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
  /** Ưu tiên cải tiến / backlog ngắn (tách khỏi khuyết điểm tổng quan). */
  improvement_areas?: string;
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

/** Metadata từ n8n aggregate / cron (~1h), thường nằm trong `structured_output.initial_input`. */
export type BatchReviewMeta = {
  /** Số commit trong đợt review (null nếu không có trong dữ liệu — ví dụ bản ghi cũ trước khi merge initial_input). */
  commitsInBatch: number | null;
  batchedCommitShas: string[];
  isCronBatch: boolean;
};

function isStringArray(x: unknown): x is string[] {
  return Array.isArray(x) && x.every((i) => typeof i === "string");
}

function readInitialInputLike(structuredOutput: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!structuredOutput || typeof structuredOutput !== "object") return null;
  const ii = structuredOutput.initial_input;
  if (ii && typeof ii === "object") return ii as Record<string, unknown>;
  if (
    structuredOutput.commit_count != null ||
    structuredOutput.batched_commit_shas != null ||
    structuredOutput.cron_batch_review != null
  ) {
    return structuredOutput;
  }
  return null;
}

export function extractBatchReviewMeta(structuredOutput: Record<string, unknown> | null): BatchReviewMeta {
  const empty: BatchReviewMeta = { commitsInBatch: null, batchedCommitShas: [], isCronBatch: false };
  const src = readInitialInputLike(structuredOutput);
  if (!src) return empty;

  const isCronBatch = Boolean(src.cron_batch_review);
  let batchedCommitShas: string[] = [];
  if (isStringArray(src.batched_commit_shas)) {
    batchedCommitShas = src.batched_commit_shas.filter((s) => s.trim().length > 0);
  }

  let commitsInBatch: number | null = null;
  if (typeof src.commit_count === "number" && Number.isFinite(src.commit_count) && src.commit_count >= 0) {
    commitsInBatch = Math.floor(src.commit_count);
  } else if (batchedCommitShas.length > 0) {
    commitsInBatch = batchedCommitShas.length;
  }

  return { commitsInBatch, batchedCommitShas, isCronBatch };
}

function resolveCommitsInBatchN(meta: BatchReviewMeta): number | null {
  if (meta.commitsInBatch != null && Number.isFinite(meta.commitsInBatch)) return meta.commitsInBatch;
  if (meta.batchedCommitShas.length > 0) return meta.batchedCommitShas.length;
  return null;
}

/**
 * Giá trị chip (không lặp với `label` MetaChip).
 * Hiện khi cron ~1h hoặc nhiều hơn 1 commit trong đợt; bản ghi cũ không có `initial_input` → null.
 */
export function formatBatchReviewDisplayValue(meta: BatchReviewMeta): string | null {
  const n = resolveCommitsInBatchN(meta);
  if (meta.isCronBatch) {
    if (n != null) return `${n} commit · cron ~1h`;
    return "Cron ~1h (chưa rõ số commit)";
  }
  if (n != null && n > 1) return `${n} commit trong đợt`;
  return null;
}

export function formatBatchedShaPreview(shas: string[], maxHead = 3): string | null {
  if (shas.length === 0) return null;
  const heads = shas.slice(0, maxHead).map((s) => (s.length > 7 ? s.slice(0, 7) : s));
  const rest = shas.length - maxHead;
  return rest > 0 ? `${heads.join(", ")} +${rest}` : heads.join(", ");
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

/** DD/MM/YYYY, HH:mm:ss (giờ địa phương). */
export function toAbsoluteTime(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy}, ${h}:${min}:${s}`;
}

export function toRelativeTime(value: string) {
  const now = Date.now();
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return "—";
  const diffSec = Math.max(0, Math.floor((now - then) / 1000));
  if (diffSec < 10) return "Vừa xong";
  if (diffSec < 60) return `${diffSec} giây trước`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} phút trước`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} giờ trước`;
  return `${Math.floor(diffSec / 86400)} ngày trước`;
}

/** Nhãn trạng thái review cho chip/badge (tiếng Việt). */
export function formatStatusLabel(status: string) {
  const s = String(status).toLowerCase().trim();
  if (s === "done") return "Hoàn thành";
  if (s === "llm_started") return "Đang xử lý";
  if (s === "error") return "Lỗi";
  if (s === "no_data") return "Chưa có dữ liệu";
  return status;
}

/** Ẩn badge/chip trạng thái khi đã xong (gọn UI; vẫn giữ llm_started / error). */
export function shouldShowReviewStatusBadge(status: string) {
  return String(status).toLowerCase().trim() !== "done";
}

export function eventLabel(status: string) {
  return formatStatusLabel(status);
}

export function fallbackSummary(status: string) {
  if (status === "done") return "Đã lưu kết quả review.";
  if (status === "llm_started") return "Đã nhận push; AI đang phân tích.";
  if (status === "error") return "Lỗi khi xử lý review.";
  return "Chưa có tóm tắt.";
}


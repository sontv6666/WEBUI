import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { AssessmentBlock, CriteriaComments, InventoryExhaustive, ReviewItem } from "../types/reviews";
import {
  buildSkeletonTestCasesFromInventory,
  extractAssessment,
  extractBatchReviewMeta,
  extractCriteriaComments,
  hasAggregateRubricContent,
  hasSmbAdvisoryContent,
  extractInventoryExhaustive,
  extractOverallPicture,
  extractPromptRefinement,
  extractRagMaturity,
  extractSuggestedQuestionsForTeam,
  extractSuggestedTestCases,
  fallbackSummary,
  formatBatchReviewDisplayValue,
  formatBatchedShaPreview,
  formatStatusLabel,
  isPerPushReview,
  reviewKindLabelVi,
  reviewKindOf,
  shouldShowReviewStatusBadge,
  shortSha,
  toAbsoluteTime,
  toRelativeTime,
} from "../types/reviews";
import { computePageCount, PaginationBar, slicePage } from "./Pagination";
import { IdentityPlaceholder, MetaChips, ProjectToolsPanels, ProsePre, SectionLabel, Skeleton } from "./Presentation";
import { SmbScaleAdvisoryPanel, TeamAggregateCriteriaSections } from "./RubricAndAdvisoryPanels";

const PUSH_LIST_PAGE_SIZE = 5;

/** Neo cuộn cho mục lục trang chi tiết đội (khối tổng hợp đội) */
export const AGGREGATE_SECTION_IDS = {
  historical: "aggregate-section-historical",
  evolution: "aggregate-section-evolution",
  inventory: "aggregate-section-inventory",
  rag: "aggregate-section-rag",
  assessment: "aggregate-section-assessment",
  r1: "aggregate-section-r1",
  r2: "aggregate-section-r2",
  smb: "aggregate-section-smb",
  prompt: "aggregate-section-prompt",
  tests: "aggregate-section-tests",
  questions: "aggregate-section-questions",
} as const;

const R1_CRITERIA_KEYS: (keyof CriteriaComments)[] = ["R1_01", "R1_02", "R1_03", "R1_04", "R1_05"];
const R2_CRITERIA_KEYS: (keyof CriteriaComments)[] = ["R2_01", "R2_02", "R2_03", "R2_04", "R2_05"];

function criteriaHasAnyKey(c: CriteriaComments | null, keys: (keyof CriteriaComments)[]): boolean {
  if (!c) return false;
  return keys.some((k) => String(c[k] ?? "").trim().length > 0);
}

function shouldShowAggregateRagInNav(
  structuredOutput: Record<string, unknown> | null,
  columnRagLevel: string | null | undefined
): boolean {
  const rm = extractRagMaturity(structuredOutput);
  const col = (columnRagLevel && columnRagLevel.trim()) || "";
  const fromStruct = (rm?.level && rm.level.trim()) || "";
  const features = rm?.features_detected ?? [];
  if (features.length > 0) return true;
  if (features.length === 0) {
    if (!fromStruct) return false;
    if (fromStruct === col) return false;
  }
  return true;
}

const INVENTORY_LABELS: Array<{ key: keyof InventoryExhaustive; label: string }> = [
  { key: "llm_models_and_apis", label: "LLM / API" },
  { key: "frameworks_and_runtimes", label: "Framework & runtime" },
  { key: "vector_databases", label: "Vector DB" },
  { key: "agent_orchestration", label: "Agent / orchestration" },
  { key: "third_party_integrations", label: "Tích hợp khác" },
];

const ASSESSMENT_LABELS: Array<{ key: keyof AssessmentBlock; label: string }> = [
  { key: "advantages", label: "Ưu điểm" },
  { key: "disadvantages", label: "Khuyết điểm" },
  { key: "improvement_areas", label: "Điểm cần cải thiện" },
  { key: "context_and_fit", label: "Ngữ cảnh & đề bài" },
  { key: "source_structure", label: "Cấu trúc source" },
  { key: "completeness", label: "Độ hoàn thiện" },
  { key: "security", label: "Bảo mật" },
];

function hasAssessmentForNav(structuredOutput: Record<string, unknown> | null): boolean {
  const assessment = extractAssessment(structuredOutput);
  if (!assessment) return false;
  return ASSESSMENT_LABELS.some(({ key }) => Boolean((assessment[key] as string | undefined)?.trim()));
}

/** Mục lục neo (chỉ mục có nội dung tương ứng trong bản tổng hợp đội). */
export function getAggregateNavEntries(rows: ReviewItem[]): Array<{ id: string; label: string }> {
  const aggregateRow = pickLatestAggregate(rows);
  if (!aggregateRow) return [];
  const so = aggregateRow.structured_output;
  const ctx = getExtendedLlmContext(so);
  const op = extractOverallPicture(so);
  const items: Array<{ id: string; label: string }> = [];

  const hist = typeof op?.historical_synthesis === "string" ? op.historical_synthesis.trim() : "";
  const evo = typeof op?.evolution_notes === "string" ? op.evolution_notes.trim() : "";
  if (hist) items.push({ id: AGGREGATE_SECTION_IDS.historical, label: "Tổng hợp lịch sử" });
  if (evo) items.push({ id: AGGREGATE_SECTION_IDS.evolution, label: "Tiến hóa qua các lần push" });
  if (ctx.hasInventory) {
    items.push({ id: AGGREGATE_SECTION_IDS.inventory, label: "Danh mục công nghệ (toàn đội, gộp từ lịch sử)" });
  }
  if (shouldShowAggregateRagInNav(so, aggregateRow.rag_level)) {
    items.push({ id: AGGREGATE_SECTION_IDS.rag, label: "RAG — mức độ và tính năng (từ LLM)" });
  }
  if (hasAssessmentForNav(so)) {
    items.push({ id: AGGREGATE_SECTION_IDS.assessment, label: "Đánh giá (cấp đội / toàn hệ thống)" });
  }
  const criteria = extractCriteriaComments(so);
  if (criteriaHasAnyKey(criteria, R1_CRITERIA_KEYS)) {
    items.push({ id: AGGREGATE_SECTION_IDS.r1, label: "Tiêu chí R1 — toàn hệ thống" });
  }
  if (criteriaHasAnyKey(criteria, R2_CRITERIA_KEYS)) {
    items.push({ id: AGGREGATE_SECTION_IDS.r2, label: "Tiêu chí R2 — toàn hệ thống" });
  }
  if (hasSmbAdvisoryContent(so)) {
    items.push({ id: AGGREGATE_SECTION_IDS.smb, label: "Gợi ý cải tiến (SMB & quy mô)" });
  }
  if (ctx.promptHint) {
    items.push({ id: AGGREGATE_SECTION_IDS.prompt, label: "Gợi ý tối ưu prompt — nên chỉnh gì" });
  }
  if (ctx.hasAiTests || ctx.hasSkeletonTests) {
    items.push({ id: AGGREGATE_SECTION_IDS.tests, label: "Test case — toàn hệ thống" });
  }
  if (ctx.hasQuestions) {
    items.push({ id: AGGREGATE_SECTION_IDS.questions, label: "Câu hỏi — cấp đội / toàn hệ thống" });
  }
  return items;
}

type ExtendedLlmContext = {
  inv: InventoryExhaustive | null;
  hasInventory: boolean;
  aiTests: string[] | null;
  skeletonTests: string[];
  questions: string[] | null;
  promptHint: string | null;
  hasAiTests: boolean;
  hasSkeletonTests: boolean;
  hasQuestions: boolean;
  copyTestBundle: string;
};

function getExtendedLlmContext(structuredOutput: Record<string, unknown> | null): ExtendedLlmContext {
  const inv = extractInventoryExhaustive(structuredOutput);
  const aiTests = extractSuggestedTestCases(structuredOutput);
  const questions = extractSuggestedQuestionsForTeam(structuredOutput);
  const promptHint = extractPromptRefinement(structuredOutput);

  const hasInventoryBlocks =
    inv &&
    INVENTORY_LABELS.some(({ key }) => Array.isArray(inv[key]) && (inv[key] as string[]).length > 0);
  const hasAiTests = Boolean(aiTests && aiTests.length > 0);
  const skeletonTests = !hasAiTests && hasInventoryBlocks && inv ? buildSkeletonTestCasesFromInventory(inv) : [];
  const hasSkeletonTests = skeletonTests.length > 0;
  const hasQuestions = Boolean(questions && questions.length > 0);
  const copyTestBundle = [...(aiTests ?? []), ...skeletonTests].join("\n\n---\n\n");

  return {
    inv: inv ?? null,
    hasInventory: Boolean(hasInventoryBlocks && inv),
    aiTests: aiTests ?? null,
    skeletonTests,
    questions: questions ?? null,
    promptHint,
    hasAiTests,
    hasSkeletonTests,
    hasQuestions,
    copyTestBundle,
  };
}

function renderInventorySectionFromCtx(ctx: ExtendedLlmContext, scope: "push" | "team", anchorId?: string) {
  if (!ctx.hasInventory || !ctx.inv) return null;
  const inv = ctx.inv;
  const invTitle =
    scope === "team" ? "Danh mục công nghệ (toàn đội, gộp từ lịch sử)" : "Danh mục công nghệ (liệt kê đầy đủ)";
  return (
    <div className="criteria-box llm-extended-block aggregate-section-target" id={anchorId}>
      <div className="llm-section-chunk">
        <SectionLabel icon="▤">{invTitle}</SectionLabel>
        <div className="inventory-grid">
          {INVENTORY_LABELS.map(({ key, label }) => {
            const arr = (inv[key] as string[] | undefined) ?? [];
            if (!arr.length) return null;
            return (
              <div key={key} className="inventory-category">
                <span className="inventory-cat-label">{label}</span>
                <ul className="inventory-tags">
                  {arr.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function renderPromptRefinementFromCtx(ctx: ExtendedLlmContext, anchorId?: string) {
  if (!ctx.promptHint) return null;
  return (
    <div className="criteria-box prompt-refine-panel aggregate-section-target" id={anchorId}>
      <SectionLabel icon="→">Gợi ý tối ưu prompt — nên chỉnh gì</SectionLabel>
      <p className="prompt-refine-panel__hint">
        Chỉ liệt kê hạng mục cần tối ưu (LLM được hướng dẫn trả gạch đầu dòng ngắn); tránh sao chép cả prompt dài.
      </p>
      <ProsePre>{ctx.promptHint}</ProsePre>
    </div>
  );
}

function pickLatestAggregate(rows: ReviewItem[]): ReviewItem | null {
  const agg = rows.filter((r) => reviewKindOf(r) === "team_aggregate");
  if (agg.length === 0) return null;
  return agg.reduce((best, r) => (new Date(r.updated_at) >= new Date(best.updated_at) ? r : best));
}

function pickLatestPerPush(perPushRows: ReviewItem[]): ReviewItem | null {
  if (perPushRows.length === 0) return null;
  return perPushRows.reduce((best, r) => (new Date(r.updated_at) >= new Date(best.updated_at) ? r : best));
}

function pushCardKey(item: ReviewItem) {
  return `${item.team_id}-${item.commit_sha}-${item.updated_at}`;
}

/** Ưu tiên bản tổng hợp đội (mới nhất); không có thì gom từ các push. */
function resolveTeamIdentity(perPushRows: ReviewItem[], aggregateRow: ReviewItem | null) {
  if (aggregateRow) {
    const op = extractOverallPicture(aggregateRow.structured_output);
    const pa = (op?.project_about ?? "").trim();
    const tb = (op?.tools_plain_bullets ?? "").trim();
    if (pa || tb) return { project_about: pa || null, tools_plain_bullets: tb || null };
  }
  let projectAbout = "";
  let toolsBullets = "";
  for (const row of perPushRows) {
    const op = extractOverallPicture(row.structured_output);
    if (!projectAbout && (op?.project_about ?? "").trim()) projectAbout = (op?.project_about ?? "").trim();
    if (!toolsBullets && (op?.tools_plain_bullets ?? "").trim()) toolsBullets = (op?.tools_plain_bullets ?? "").trim();
    if (projectAbout && toolsBullets) break;
  }
  return {
    project_about: projectAbout || null,
    tools_plain_bullets: toolsBullets || null,
  };
}

export function TeamDetail({
  teamId,
  teams,
  onTeamChange,
  onOpenTeam,
  rows,
  loading,
  /** Trang chủ (cột Timeline): chỉ đánh giá push mới nhất — không tổng hợp đội, không danh sách push. */
  homeSidebar = false,
}: {
  teamId: string;
  teams: Array<{ teamId: string; repoName?: string }>;
  onTeamChange: (teamId: string) => void;
  onOpenTeam?: (teamId: string) => void;
  rows: ReviewItem[];
  loading: boolean;
  homeSidebar?: boolean;
}) {
  const [pushPage, setPushPage] = useState(1);
  const [panelsExpanded, setPanelsExpanded] = useState(true);
  const [pushDetailOpen, setPushDetailOpen] = useState<Record<string, boolean>>({});

  const aggregateRow = useMemo(() => pickLatestAggregate(rows), [rows]);
  const perPushRows = useMemo(() => rows.filter(isPerPushReview), [rows]);
  const latestPerPush = useMemo(() => pickLatestPerPush(perPushRows), [perPushRows]);

  const identity = resolveTeamIdentity(perPushRows, aggregateRow);
  const hasIdentity = Boolean(identity.project_about || identity.tools_plain_bullets);

  const pushPageCount = useMemo(() => computePageCount(perPushRows.length, PUSH_LIST_PAGE_SIZE), [perPushRows.length]);

  const paginatedPushRows = useMemo(() => slicePage(perPushRows, pushPage, PUSH_LIST_PAGE_SIZE), [perPushRows, pushPage]);

  useEffect(() => {
    setPushPage(1);
    setPushDetailOpen({});
  }, [teamId]);

  useEffect(() => {
    if (pushPage > pushPageCount) setPushPage(pushPageCount);
  }, [pushPage, pushPageCount]);

  /** Trang chi tiết: mặc định thu gọn mọi push (chỉ mở khi người dùng bấm). */
  const isPushDetailExpanded = (key: string) => pushDetailOpen[key] ?? false;

  const expandAllPushDetailsOnPage = useCallback(() => {
    setPushDetailOpen((prev) => {
      const next = { ...prev };
      for (const item of paginatedPushRows) {
        next[pushCardKey(item)] = true;
      }
      return next;
    });
  }, [paginatedPushRows]);

  const collapseAllPushDetailsOnPage = useCallback(() => {
    setPushDetailOpen((prev) => {
      const next = { ...prev };
      for (const item of paginatedPushRows) {
        next[pushCardKey(item)] = false;
      }
      return next;
    });
  }, [paginatedPushRows]);

  return (
    <section
      className={`panel team-panel ${homeSidebar ? "team-panel--home-sidebar" : ""} ${
        panelsExpanded ? "" : "team-panel--compact-panels"
      }`}
    >
      <div className="team-header">
        <div className="team-header__titles">
          <h2 className="panel-title">Đội &amp; hệ thống</h2>
          <p className="team-panel-subtitle">
            {homeSidebar
              ? "Bản per-push mới nhất của đội đang chọn."
              : "Ưu tiên so sánh đội qua chất lượng RAG và các khía cạnh phi chức năng, không chỉ tính năng."}
          </p>
        </div>
        <select value={teamId} onChange={(e) => onTeamChange(e.target.value)} aria-label="Chọn đội">
          {teams.map((team) => (
            <option key={team.teamId} value={team.teamId}>
              {team.repoName ? `${team.teamId} · ${team.repoName}` : team.teamId}
            </option>
          ))}
        </select>
      </div>

      {teamId && !homeSidebar ? (
        <div className="team-panel-toolbar" role="toolbar" aria-label="Thu gọn hoặc mở rộng panel chi tiết">
          <span className="team-panel-toolbar__hint">Panel chi tiết (đánh giá, test, câu hỏi, JSON)</span>
          <div className="team-panel-toolbar__actions">
            <button
              type="button"
              className={`team-panel-toolbtn ${panelsExpanded ? "" : "team-panel-toolbtn--active"}`}
              onClick={() => setPanelsExpanded(false)}
            >
              Thu gọn
            </button>
            <button
              type="button"
              className={`team-panel-toolbtn ${panelsExpanded ? "team-panel-toolbtn--active" : ""}`}
              onClick={() => setPanelsExpanded(true)}
            >
              Mở rộng
            </button>
          </div>
        </div>
      ) : null}

      {teamId && !homeSidebar ? (
        <div className="identity-first-block page-section">
          <div className="page-section-head">
            <h3 className="system-hero-title page-section-title">Hệ thống — mô tả &amp; công cụ</h3>
          </div>
          {loading && !hasIdentity ? (
            <Skeleton className="skeleton-line" style={{ height: 88 }} />
          ) : hasIdentity ? (
            <ProjectToolsPanels
              variant="hero"
              projectAbout={identity.project_about}
              toolsBullets={identity.tools_plain_bullets}
            />
          ) : (
            <IdentityPlaceholder />
          )}
        </div>
      ) : null}

      {teamId && !loading && latestPerPush ? (
        <div className="latest-push-snapshot" role="region" aria-label="Đánh giá push mới nhất">
          <h3 className="latest-push-snapshot__title">Đánh giá push mới nhất</h3>
          <p className="latest-push-snapshot__meta">
            Commit {shortSha(latestPerPush.commit_sha)} · cập nhật {toRelativeTime(latestPerPush.updated_at)} ·{" "}
            {toAbsoluteTime(latestPerPush.updated_at)}
            {latestPerPush.rag_level ? ` · RAG ${latestPerPush.rag_level}` : ""}
          </p>
          <MetaChips
            items={(() => {
              const bm = extractBatchReviewMeta(latestPerPush.structured_output);
              const bv = formatBatchReviewDisplayValue(bm);
              const bsp = formatBatchedShaPreview(bm.batchedCommitShas);
              const chips: Array<{ label: string; value: string }> = [
                { label: "Repo", value: latestPerPush.repo_name || "—" },
                { label: "Trạng thái", value: formatStatusLabel(latestPerPush.status) },
              ];
              if (bv) chips.push({ label: "Đợt review", value: bv });
              if (bsp) chips.push({ label: "SHA trong đợt", value: bsp });
              return chips;
            })()}
          />
          <p className="summary-text latest-push-snapshot__summary">
            {latestPerPush.push_summary ||
              extractOverallPicture(latestPerPush.structured_output)?.push_summary ||
              fallbackSummary(latestPerPush.status)}
          </p>
          {renderCollapsibleRagAndAssessment(
            latestPerPush.structured_output,
            latestPerPush.rag_level,
            "push",
            "RAG & đánh giá chi tiết (push mới nhất) — nhấp để mở",
            "push-core-review-details--snapshot"
          )}
          {!homeSidebar ? (
            <p className="latest-push-snapshot__hint">
              Luôn hiển thị bản <strong>per-push</strong> mới nhất theo thời gian cập nhật (toàn đội, không phụ thuộc trang
              phân trang). Dữ liệu đồng bộ từ Supabase khi có review mới (realtime + làm mới định kỳ).
            </p>
          ) : null}
        </div>
      ) : null}

      {teamId && !loading && homeSidebar && !latestPerPush && rows.length > 0 ? (
        <p className="state state--muted" role="status">
          Chưa có bản ghi <strong>per-push</strong> cho đội này — không thể hiển thị đánh giá push mới nhất.
        </p>
      ) : null}

      {teamId && !loading && !homeSidebar && aggregateRow ? (
        <article className="timeline-item team-aggregate-card" data-status={aggregateRow.status}>
          <div className="page-section-head team-aggregate-head">
            <h3 className="subsection-title page-section-title">Đánh giá toàn hệ thống</h3>
            <span className="badge badge--kind">{reviewKindLabelVi("team_aggregate")}</span>
          </div>
          <p className="team-aggregate-note">
            Nội dung lấy từ bản ghi <strong>tổng hợp đội</strong> mới nhất trong DB — khi có commit/pipeline mới, chạy lại workflow aggregate
            để cập nhật (realtime và polling 60s đã bật cho bảng này).
          </p>
          <div className="detail-panels-region team-aggregate-sections">
            {(() => {
              const so = aggregateRow.structured_output;
              const ctx = getExtendedLlmContext(so);
              return (
                <>
                  {renderHistoricalSynthesis(so, AGGREGATE_SECTION_IDS.historical, AGGREGATE_SECTION_IDS.evolution)}
                  {renderInventorySectionFromCtx(ctx, "team", AGGREGATE_SECTION_IDS.inventory)}
                  {renderRagMaturityPanel(so, aggregateRow.rag_level, AGGREGATE_SECTION_IDS.rag)}
                  {renderAssessmentBlock(so, "team", AGGREGATE_SECTION_IDS.assessment)}
                  <TeamAggregateCriteriaSections
                    structuredOutput={so}
                    anchorIdR1={AGGREGATE_SECTION_IDS.r1}
                    anchorIdR2={AGGREGATE_SECTION_IDS.r2}
                  />
                  <SmbScaleAdvisoryPanel structuredOutput={so} anchorId={AGGREGATE_SECTION_IDS.smb} />
                  {renderPromptRefinementFromCtx(ctx, AGGREGATE_SECTION_IDS.prompt)}
                  {renderTestCasesPanel(ctx, "team", "aggregate", AGGREGATE_SECTION_IDS.tests)}
                  {renderQuestionsPanel(ctx, "team", "aggregate", AGGREGATE_SECTION_IDS.questions)}
                  {renderAggregateRubricAdvisoryPlaceholder(so)}
                </>
              );
            })()}
            <details className="json-details">
              <summary>Structured output — tổng hợp đội (JSON)</summary>
              <pre>{JSON.stringify(aggregateRow.structured_output || {}, null, 2)}</pre>
            </details>
          </div>
        </article>
      ) : null}

      {teamId && !loading && !homeSidebar && !aggregateRow && perPushRows.length > 0 ? (
        <div className="team-aggregate-missing" role="status">
          <p>
            <strong>Chưa có đánh giá tổng hợp toàn hệ thống</strong> (hàng <code>team_aggregate</code> trong{" "}
            <code>ai_reviews</code>). Hiện chỉ có review theo từng push. Khi n8n ghi bản tổng hợp đội (workflow mới),
            khối trên sẽ hiện tiêu chí R1/R2, gợi ý cải tiến SMB &amp; quy mô, test case và câu hỏi cấp hệ thống.
          </p>
        </div>
      ) : null}

      {teamId && !homeSidebar ? (
        <div className="page-section-head push-list-head push-list-head--with-actions">
          <h3 className="subsection-title page-section-title">Theo từng lần push</h3>
          {!loading && perPushRows.length > 0 ? (
            <div className="push-list-head__actions" role="group" aria-label="Mở hoặc thu chi tiết mọi push trên trang này">
              <button type="button" className="push-list-page-toolbtn" onClick={expandAllPushDetailsOnPage}>
                Mở rộng tất cả (trang này)
              </button>
              <button type="button" className="push-list-page-toolbtn" onClick={collapseAllPushDetailsOnPage}>
                Thu gọn tất cả (trang này)
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
      {loading && (
        <div aria-busy="true">
          {homeSidebar ? (
            <Skeleton className="skeleton-line" style={{ height: 100, marginBottom: 8 }} />
          ) : (
            <>
              <Skeleton className="skeleton-line" style={{ height: 120, marginBottom: 12 }} />
              <Skeleton className="skeleton-line" style={{ height: 120, marginBottom: 12 }} />
            </>
          )}
        </div>
      )}
      {!teamId && !loading && <p className="state">Chưa chọn đội.</p>}
      {teamId && !loading && rows.length === 0 && <p className="state">Đội này chưa có bản ghi review.</p>}
      {teamId && !loading && !homeSidebar && rows.length > 0 && perPushRows.length === 0 && (
        <p className="state state--muted">Chưa có bản ghi review theo từng push (chỉ có tổng hợp đội hoặc dữ liệu khác).</p>
      )}
      {teamId && !loading && !homeSidebar && perPushRows.length > 0 && (
        <PaginationBar
          page={pushPage}
          pageCount={pushPageCount}
          totalItems={perPushRows.length}
          pageSize={PUSH_LIST_PAGE_SIZE}
          onPageChange={setPushPage}
          ariaLabel="Phân trang danh sách push theo đội"
        />
      )}
      {!loading &&
        !homeSidebar &&
        paginatedPushRows.map((item) => {
          const cardKey = pushCardKey(item);
          const detailOpen = isPushDetailExpanded(cardKey);
          const op = extractOverallPicture(item.structured_output);
          const batchMeta = extractBatchReviewMeta(item.structured_output);
          const batchValue = formatBatchReviewDisplayValue(batchMeta);
          const batchShaPreview = formatBatchedShaPreview(batchMeta.batchedCommitShas);
          const pushChips: Array<{ label: string; value: string }> = [
            { label: "Repo", value: item.repo_name || "—" },
            { label: "Commit", value: shortSha(item.commit_sha) },
            { label: "Cập nhật", value: `${toRelativeTime(item.updated_at)} · ${toAbsoluteTime(item.updated_at)}` },
            { label: "RAG", value: item.rag_level || "—" },
            { label: "Input", value: String(item.input_code_length ?? 0) },
          ];
          if (batchValue) pushChips.push({ label: "Đợt review", value: batchValue });
          if (batchShaPreview) pushChips.push({ label: "SHA trong đợt", value: batchShaPreview });
          return (
            <article
              key={cardKey}
              className={`timeline-item push-detail-card ${onOpenTeam ? "clickable" : ""}`}
              data-status={item.status}
              onClick={onOpenTeam ? () => onOpenTeam(item.team_id) : undefined}
              role={onOpenTeam ? "button" : undefined}
              tabIndex={onOpenTeam ? 0 : undefined}
              onKeyDown={
                onOpenTeam
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") onOpenTeam(item.team_id);
                    }
                  : undefined
              }
            >
              <div className="line push-detail-card__headrow">
                <div className="push-detail-card__title-group">
                  <strong>Commit {shortSha(item.commit_sha)}</strong>
                  {shouldShowReviewStatusBadge(item.status) ? (
                    <span className={`badge ${item.status}`}>{formatStatusLabel(item.status)}</span>
                  ) : null}
                </div>
                <div
                  className="push-detail-card__toggle-wrap"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    className="push-detail-card__toggle"
                    aria-expanded={detailOpen}
                    aria-controls={`push-detail-body-${cardKey}`}
                    id={`push-detail-toggle-${cardKey}`}
                    onClick={() =>
                      setPushDetailOpen((prev) => ({
                        ...prev,
                        [cardKey]: !detailOpen,
                      }))
                    }
                  >
                    {detailOpen ? "Thu gọn chi tiết" : "Mở rộng chi tiết"}
                  </button>
                </div>
              </div>
              <MetaChips items={pushChips} />
              <p className="summary-text">
                {item.push_summary ||
                  extractOverallPicture(item.structured_output)?.push_summary ||
                  fallbackSummary(item.status)}
              </p>
              {renderCollapsibleRagAndAssessment(
                item.structured_output,
                item.rag_level,
                "push",
                "RAG & đánh giá chi tiết (push) — nhấp để mở",
                "push-core-review-details--list"
              )}
              <div
                className="push-detail-card__collapsible"
                id={`push-detail-body-${cardKey}`}
                role="region"
                aria-labelledby={`push-detail-toggle-${cardKey}`}
                hidden={!detailOpen}
              >
                <ProjectToolsPanels projectAbout={op?.project_about} toolsBullets={op?.tools_plain_bullets} />
                <div className="detail-panels-region">
                  {renderExtendedLlmSections(item.structured_output, { scope: "push", panelIdSuffix: cardKey })}
                  {renderHistoricalSynthesis(item.structured_output)}
                  <details className="json-details">
                    <summary>Structured output — push này (JSON)</summary>
                    <pre>{JSON.stringify(item.structured_output || {}, null, 2)}</pre>
                  </details>
                </div>
              </div>
            </article>
          );
        })}
    </section>
  );
}

function renderCollapsibleRagAndAssessment(
  structuredOutput: Record<string, unknown> | null,
  ragLevel: string | null | undefined,
  assessmentScope: "push" | "team",
  summaryText: string,
  detailsExtraClass?: string
) {
  const ragPanel = renderRagMaturityPanel(structuredOutput, ragLevel);
  const assessBlock = renderAssessmentBlock(structuredOutput, assessmentScope);
  if (!ragPanel && !assessBlock) return null;
  return (
    <details
      className={`push-core-review-details${detailsExtraClass ? ` ${detailsExtraClass}` : ""}`}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <summary className="push-core-review-details__summary">{summaryText}</summary>
      <div
        className={`push-core-review-block push-core-review-block--in-details${
          assessmentScope === "team" ? " push-core-review-block--aggregate-inner" : ""
        }`}
      >
        {ragPanel}
        {assessBlock}
      </div>
    </details>
  );
}

function renderAggregateRubricAdvisoryPlaceholder(structuredOutput: Record<string, unknown> | null) {
  const hasR = hasAggregateRubricContent(structuredOutput);
  const hasS = hasSmbAdvisoryContent(structuredOutput);
  if (hasR && hasS) return null;
  const parts: string[] = [];
  if (!hasR) parts.push("tiêu chí R1/R2 (criteria_comments)");
  if (!hasS) parts.push("gợi ý SMB & quy mô (smb_scale_advisory)");
  return (
    <p className="state state--muted aggregate-extras-placeholder" role="status">
      Chưa có {parts.join(" hoặc ")} trong bản ghi tổng hợp này — mở <strong>Structured output — tổng hợp đội (JSON)</strong>{" "}
      bên dưới để kiểm tra; nếu thiếu key hoặc chuỗi rỗng, import workflow n8n đã cập nhật schema và{" "}
      <strong>chạy lại</strong> luồng tổng hợp đội.
    </p>
  );
}

function renderRagMaturityPanel(
  structuredOutput: Record<string, unknown> | null,
  columnRagLevel: string | null | undefined,
  anchorDomId?: string
) {
  const rm = extractRagMaturity(structuredOutput);
  const col = (columnRagLevel && columnRagLevel.trim()) || "";
  const fromStruct = (rm?.level && rm.level.trim()) || "";
  const features = rm?.features_detected ?? [];

  if (features.length === 0) {
    if (!fromStruct) return null;
    if (fromStruct === col) return null;
  }

  const levelLine = fromStruct || col || null;

  return (
    <div
      className="criteria-box rag-maturity-panel aggregate-section-target"
      id={anchorDomId}
      aria-label="Mức RAG và tính năng phát hiện"
    >
      <SectionLabel icon="△">RAG — mức độ và tính năng (từ LLM)</SectionLabel>
      {levelLine ? (
        <p className="rag-maturity-panel__level">
          <span className="rag-maturity-panel__label">Mức</span> {levelLine}
        </p>
      ) : null}
      {features.length > 0 ? (
        <ul className="rag-maturity-panel__features">
          {features.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function renderAssessmentBlock(
  structuredOutput: Record<string, unknown> | null,
  scope: "push" | "team",
  anchorDomId?: string
) {
  const assessment = extractAssessment(structuredOutput);
  if (!assessment) return null;
  const hasAny = ASSESSMENT_LABELS.some(({ key }) => Boolean((assessment[key] as string | undefined)?.trim()));
  if (!hasAny) return null;
  const title =
    scope === "team" ? "Đánh giá (cấp đội / toàn hệ thống)" : "Đánh giá chi tiết (assessment)";
  return (
    <div className="criteria-box llm-extended-block assessment-always-visible aggregate-section-target" id={anchorDomId}>
      <div className="llm-section-chunk">
        <SectionLabel icon="◎">{title}</SectionLabel>
        {ASSESSMENT_LABELS.map(({ key, label }) => {
          const text = (assessment[key] as string | undefined)?.trim();
          if (!text) return null;
          return (
            <div key={key} className="assessment-row">
              <span className="criteria-item-label">{label}</span>
              <ProsePre>{text}</ProsePre>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CopyTextButton({ text, children }: { text: string; children: ReactNode }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="copy-text-btn"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          window.setTimeout(() => setDone(false), 2000);
        } catch {
          /* ignore */
        }
      }}
    >
      {done ? "Đã sao chép" : children}
    </button>
  );
}

function renderTestCasesPanel(
  ctx: ExtendedLlmContext,
  scope: "push" | "team",
  panelIdSuffix: string,
  scrollAnchorId?: string
) {
  if (!ctx.hasAiTests && !ctx.hasSkeletonTests) return null;
  const aiTests = ctx.aiTests;
  const skeletonTests = ctx.skeletonTests;
  const testSubtitle =
    scope === "team"
      ? "Kịch bản end-to-end, demo, hồi quy — theo bản tổng hợp đội mới nhất."
      : "Theo stack đội; có thể bổ sung khung khi AI chưa trả đủ.";
  const testsHeadingId = `review-panel-tests-heading-${panelIdSuffix}`;
  return (
    <section
      className="review-panel review-panel--tests aggregate-section-target"
      id={scrollAnchorId}
      aria-labelledby={testsHeadingId}
    >
      <header className="review-panel__head">
        <div>
          <h4 id={testsHeadingId} className="review-panel__title">
            <span className="review-panel__icon" aria-hidden>
              ✓
            </span>
            {scope === "team" ? "Test case — toàn hệ thống" : "Test case gợi ý"}
          </h4>
          <p className="review-panel__subtitle">{testSubtitle}</p>
        </div>
        {ctx.copyTestBundle.trim() ? (
          <CopyTextButton text={ctx.copyTestBundle}>Sao chép tất cả</CopyTextButton>
        ) : null}
      </header>
      <div className="review-panel__body">
        {ctx.hasAiTests && aiTests ? (
          <div className="review-panel__group">
            <span className="review-panel__group-label">Từ phân tích AI</span>
            <ul className="test-case-cards">
              {aiTests.map((t, i) => (
                <li key={`ai-${i}`} className="test-case-card">
                  <span className="test-case-card__badge">TC {String(i + 1).padStart(2, "0")}</span>
                  <div className="test-case-card__body">
                    <ProsePre>{t}</ProsePre>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {ctx.hasSkeletonTests ? (
          <div className="review-panel__group">
            <span className="review-panel__group-label review-panel__group-label--muted">Khung gợi ý (theo danh mục)</span>
            <ul className="test-case-cards test-case-cards--skeleton">
              {skeletonTests.map((t, i) => (
                <li key={`sk-${i}`} className="test-case-card test-case-card--skeleton">
                  <span className="test-case-card__badge test-case-card__badge--muted">+{i + 1}</span>
                  <div className="test-case-card__body">
                    <ProsePre>{t}</ProsePre>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function renderQuestionsPanel(
  ctx: ExtendedLlmContext,
  scope: "push" | "team",
  panelIdSuffix: string,
  scrollAnchorId?: string
) {
  if (!ctx.hasQuestions || !ctx.questions) return null;
  const questions = ctx.questions;
  const questionsSubtitle =
    scope === "team"
      ? "Câu hỏi phỏng vấn / Q&A cấp đội (theo bản tổng hợp mới nhất)."
      : "Gợi ý khi demo hoặc chấm.";
  const questionsHeadingId = `review-panel-questions-heading-${panelIdSuffix}`;
  return (
    <section
      className="review-panel review-panel--questions aggregate-section-target"
      id={scrollAnchorId}
      aria-labelledby={questionsHeadingId}
    >
      <header className="review-panel__head">
        <div>
          <h4 id={questionsHeadingId} className="review-panel__title">
            <span className="review-panel__icon review-panel__icon--questions" aria-hidden>
              ?
            </span>
            {scope === "team" ? "Câu hỏi — cấp đội / toàn hệ thống" : "Câu hỏi gợi ý cho đội"}
          </h4>
          <p className="review-panel__subtitle">{questionsSubtitle}</p>
        </div>
        <CopyTextButton text={questions.join("\n\n")}>Sao chép tất cả</CopyTextButton>
      </header>
      <ul className="question-cards">
        {questions.map((q, i) => (
          <li key={i} className="question-card">
            <span className="question-card__badge">Q{i + 1}</span>
            <div className="question-card__body">
              <ProsePre>{q}</ProsePre>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function renderExtendedLlmSections(
  structuredOutput: Record<string, unknown> | null,
  options?: { scope?: "push" | "team"; panelIdSuffix?: string }
) {
  const scope = options?.scope ?? "push";
  const panelIdSuffix = options?.panelIdSuffix ?? "default";
  const ctx = getExtendedLlmContext(structuredOutput);
  if (!ctx.hasInventory && !ctx.hasAiTests && !ctx.hasSkeletonTests && !ctx.hasQuestions && !ctx.promptHint) {
    return null;
  }

  const hasDualPanels = (ctx.hasAiTests || ctx.hasSkeletonTests) && ctx.hasQuestions;

  return (
    <div className="llm-review-sections">
      {renderInventorySectionFromCtx(ctx, scope)}
      {(ctx.hasAiTests || ctx.hasSkeletonTests || ctx.hasQuestions) && (
        <div className={`review-panels-grid ${hasDualPanels ? "review-panels-grid--split" : ""}`}>
          {(ctx.hasAiTests || ctx.hasSkeletonTests) && renderTestCasesPanel(ctx, scope, panelIdSuffix)}
          {ctx.hasQuestions && renderQuestionsPanel(ctx, scope, panelIdSuffix)}
        </div>
      )}
      {renderPromptRefinementFromCtx(ctx)}
    </div>
  );
}

function renderHistoricalSynthesis(
  structuredOutput: Record<string, unknown> | null,
  anchorHistoricalId?: string,
  anchorEvolutionId?: string
) {
  const op = extractOverallPicture(structuredOutput);
  if (!op) return null;
  const hist = op.historical_synthesis;
  const evo = op.evolution_notes;
  if (typeof hist !== "string" && typeof evo !== "string") return null;
  if (!hist && !evo) return null;
  return (
    <div className="criteria-box">
      {typeof hist === "string" && hist ? (
        <div className="aggregate-section-target" id={anchorHistoricalId} style={{ marginBottom: evo ? 14 : 0 }}>
          <SectionLabel icon="▣">Tổng hợp lịch sử</SectionLabel>
          <ProsePre>{hist}</ProsePre>
        </div>
      ) : null}
      {typeof evo === "string" && evo ? (
        <div className="aggregate-section-target" id={anchorEvolutionId}>
          <SectionLabel icon="↻">Tiến hóa qua các lần push</SectionLabel>
          <ProsePre>{evo}</ProsePre>
        </div>
      ) : null}
    </div>
  );
}


import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { AssessmentBlock, InventoryExhaustive, ReviewItem } from "../types/reviews";
import {
  buildSkeletonTestCasesFromInventory,
  extractAssessment,
  extractBatchReviewMeta,
  extractCriteriaComments,
  extractInventoryExhaustive,
  extractOverallPicture,
  extractPromptRefinement,
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

const PUSH_LIST_PAGE_SIZE = 5;

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
}: {
  teamId: string;
  teams: Array<{ teamId: string; repoName?: string }>;
  onTeamChange: (teamId: string) => void;
  onOpenTeam?: (teamId: string) => void;
  rows: ReviewItem[];
  loading: boolean;
}) {
  const [pushPage, setPushPage] = useState(1);
  const [panelsExpanded, setPanelsExpanded] = useState(true);
  const [pushDetailOpen, setPushDetailOpen] = useState<Record<string, boolean>>({});

  const aggregateRow = useMemo(() => pickLatestAggregate(rows), [rows]);
  const perPushRows = useMemo(() => rows.filter(isPerPushReview), [rows]);
  const latestPerPush = useMemo(() => pickLatestPerPush(perPushRows), [perPushRows]);
  const latestPerPushKey = latestPerPush ? pushCardKey(latestPerPush) : null;

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

  const isPushDetailExpanded = (key: string) =>
    pushDetailOpen[key] !== undefined ? pushDetailOpen[key] : key === latestPerPushKey;

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
    <section className={`panel team-panel ${panelsExpanded ? "" : "team-panel--compact-panels"}`}>
      <div className="team-header">
        <div className="team-header__titles">
          <h2 className="panel-title">Đội &amp; hệ thống</h2>
          <p className="team-panel-subtitle">
            Ưu tiên so sánh đội qua chất lượng RAG và các khía cạnh phi chức năng, không chỉ tính năng.
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

      {teamId ? (
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

      {teamId ? (
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
          <p className="latest-push-snapshot__hint">
            Luôn hiển thị bản <strong>per-push</strong> mới nhất theo thời gian cập nhật (toàn đội, không phụ thuộc trang
            phân trang). Dữ liệu đồng bộ từ Supabase khi có review mới (realtime + làm mới định kỳ).
          </p>
        </div>
      ) : null}

      {teamId && !loading && aggregateRow ? (
        <article className="timeline-item team-aggregate-card" data-status={aggregateRow.status}>
          <div className="page-section-head team-aggregate-head">
            <h3 className="subsection-title page-section-title">Đánh giá toàn hệ thống</h3>
            <span className="badge badge--kind">{reviewKindLabelVi("team_aggregate")}</span>
          </div>
          <p className="team-aggregate-meta">
            Cập nhật {toRelativeTime(aggregateRow.updated_at)} · {toAbsoluteTime(aggregateRow.updated_at)}
            {aggregateRow.rag_level ? ` · RAG: ${aggregateRow.rag_level}` : ""}
          </p>
          <MetaChips
            items={[
              { label: "Repo", value: aggregateRow.repo_name || "—" },
              { label: "Tham chiếu commit", value: shortSha(aggregateRow.commit_sha) },
              { label: "Trạng thái", value: formatStatusLabel(aggregateRow.status) },
            ]}
          />
          <p className="summary-text">
            {aggregateRow.push_summary ||
              extractOverallPicture(aggregateRow.structured_output)?.push_summary ||
              fallbackSummary(aggregateRow.status)}
          </p>
          <p className="team-aggregate-note">
            Nội dung lấy từ bản ghi <strong>tổng hợp đội</strong> mới nhất trong DB — khi có commit/pipeline mới, chạy lại workflow aggregate
            để cập nhật (realtime và polling 60s đã bật cho bảng này).
          </p>
          <div className="detail-panels-region">
            {renderHistoricalSynthesis(aggregateRow.structured_output)}
            {renderExtendedLlmSections(aggregateRow.structured_output, { scope: "team" })}
            <details className="json-details">
              <summary>Structured output — tổng hợp đội (JSON)</summary>
              <pre>{JSON.stringify(aggregateRow.structured_output || {}, null, 2)}</pre>
            </details>
          </div>
        </article>
      ) : null}

      {teamId && !loading && !aggregateRow && perPushRows.length > 0 ? (
        <div className="team-aggregate-missing" role="status">
          <p>
            <strong>Chưa có đánh giá tổng hợp toàn hệ thống</strong> (hàng <code>team_aggregate</code> trong{" "}
            <code>ai_reviews</code>). Hiện chỉ có review theo từng push. Khi n8n ghi bản tổng hợp đội, khối trên sẽ
            hiện tự động với test case và câu hỏi cấp hệ thống.
          </p>
        </div>
      ) : null}

      {teamId ? (
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
          <Skeleton className="skeleton-line" style={{ height: 120, marginBottom: 12 }} />
          <Skeleton className="skeleton-line" style={{ height: 120, marginBottom: 12 }} />
        </div>
      )}
      {!teamId && !loading && <p className="state">Chưa chọn đội.</p>}
      {teamId && !loading && rows.length === 0 && <p className="state">Đội này chưa có bản ghi review.</p>}
      {teamId && !loading && rows.length > 0 && perPushRows.length === 0 && (
        <p className="state state--muted">Chưa có bản ghi review theo từng push (chỉ có tổng hợp đội hoặc dữ liệu khác).</p>
      )}
      {teamId && !loading && perPushRows.length > 0 && (
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
              <div
                className="push-detail-card__collapsible"
                id={`push-detail-body-${cardKey}`}
                role="region"
                aria-labelledby={`push-detail-toggle-${cardKey}`}
                hidden={!detailOpen}
              >
                <ProjectToolsPanels projectAbout={op?.project_about} toolsBullets={op?.tools_plain_bullets} />
                <div className="detail-panels-region">
                  {renderExtendedLlmSections(item.structured_output, { scope: "push" })}
                  {renderHistoricalSynthesis(item.structured_output)}
                  {renderCriteriaCommentsPerPush(item.structured_output)}
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

function renderExtendedLlmSections(
  structuredOutput: Record<string, unknown> | null,
  options?: { scope?: "push" | "team" }
) {
  const scope = options?.scope ?? "push";
  const inv = extractInventoryExhaustive(structuredOutput);
  const assessment = extractAssessment(structuredOutput);
  const aiTests = extractSuggestedTestCases(structuredOutput);
  const questions = extractSuggestedQuestionsForTeam(structuredOutput);
  const promptHint = extractPromptRefinement(structuredOutput);

  const hasInventory =
    inv &&
    INVENTORY_LABELS.some(({ key }) => Array.isArray(inv[key]) && (inv[key] as string[]).length > 0);
  const hasAssessment =
    assessment && ASSESSMENT_LABELS.some(({ key }) => Boolean((assessment[key] as string | undefined)?.trim()));
  const hasAiTests = Boolean(aiTests && aiTests.length > 0);
  const skeletonTests = !hasAiTests && hasInventory && inv ? buildSkeletonTestCasesFromInventory(inv) : [];
  const hasSkeletonTests = skeletonTests.length > 0;
  const hasQuestions = Boolean(questions && questions.length > 0);

  if (!hasInventory && !hasAssessment && !hasAiTests && !hasSkeletonTests && !hasQuestions && !promptHint) return null;

  const copyTestBundle = [...(aiTests ?? []), ...skeletonTests].join("\n\n---\n\n");
  const hasCoreBlock = Boolean((hasInventory && inv) || (hasAssessment && assessment));
  const hasDualPanels = (hasAiTests || hasSkeletonTests) && hasQuestions;

  const invTitle =
    scope === "team" ? "Danh mục công nghệ (toàn đội, gộp từ lịch sử)" : "Danh mục công nghệ (liệt kê đầy đủ)";
  const assessmentTitle = scope === "team" ? "Đánh giá (cấp đội / toàn hệ thống)" : "Đánh giá";
  const testSubtitle =
    scope === "team"
      ? "Kịch bản end-to-end, demo, hồi quy — theo bản tổng hợp đội mới nhất."
      : "Theo stack đội; có thể bổ sung khung khi AI chưa trả đủ.";
  const questionsSubtitle =
    scope === "team"
      ? "Câu hỏi phỏng vấn / Q&A cấp đội (theo bản tổng hợp mới nhất)."
      : "Gợi ý khi demo hoặc chấm.";

  return (
    <div className="llm-review-sections">
      {hasCoreBlock ? (
        <div className="criteria-box llm-extended-block">
          {hasInventory && inv ? (
            <div className="llm-section-chunk">
              <SectionLabel icon="◇">{invTitle}</SectionLabel>
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
          ) : null}
          {hasAssessment && assessment ? (
            <div className="llm-section-chunk">
              <SectionLabel icon="◎">{assessmentTitle}</SectionLabel>
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
          ) : null}
        </div>
      ) : null}

      {(hasAiTests || hasSkeletonTests || hasQuestions) && (
        <div className={`review-panels-grid ${hasDualPanels ? "review-panels-grid--split" : ""}`}>
          {(hasAiTests || hasSkeletonTests) && (
            <section
              className="review-panel review-panel--tests"
              aria-labelledby="review-panel-tests-heading"
            >
              <header className="review-panel__head">
                <div>
                  <h4 id="review-panel-tests-heading" className="review-panel__title">
                    <span className="review-panel__icon" aria-hidden>
                      ✓
                    </span>
                    {scope === "team" ? "Test case — toàn hệ thống" : "Test case gợi ý"}
                  </h4>
                  <p className="review-panel__subtitle">{testSubtitle}</p>
                </div>
                {copyTestBundle.trim() ? (
                  <CopyTextButton text={copyTestBundle}>Sao chép tất cả</CopyTextButton>
                ) : null}
              </header>
              <div className="review-panel__body">
                {hasAiTests && aiTests ? (
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
                {hasSkeletonTests ? (
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
          )}

          {hasQuestions && questions ? (
            <section
              className="review-panel review-panel--questions"
              aria-labelledby="review-panel-questions-heading"
            >
              <header className="review-panel__head">
                <div>
                  <h4 id="review-panel-questions-heading" className="review-panel__title">
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
          ) : null}
        </div>
      )}

      {promptHint ? (
        <div className="criteria-box prompt-refine-panel">
          <SectionLabel icon="→">Gợi ý tối ưu prompt (so với prompt đội đang dùng)</SectionLabel>
          <ProsePre>{promptHint}</ProsePre>
        </div>
      ) : null}
    </div>
  );
}

function renderHistoricalSynthesis(structuredOutput: Record<string, unknown> | null) {
  if (!structuredOutput) return null;
  const overall = structuredOutput.overall_picture;
  if (!overall || typeof overall !== "object") return null;
  const o = overall as Record<string, unknown>;
  const hist = o.historical_synthesis;
  const evo = o.evolution_notes;
  if (typeof hist !== "string" && typeof evo !== "string") return null;
  if (!hist && !evo) return null;
  return (
    <div className="criteria-box">
      {typeof hist === "string" && hist ? (
        <div style={{ marginBottom: evo ? 14 : 0 }}>
          <SectionLabel icon="◎">Tổng hợp lịch sử</SectionLabel>
          <ProsePre>{hist}</ProsePre>
        </div>
      ) : null}
      {typeof evo === "string" && evo ? (
        <div>
          <SectionLabel icon="↻">Tiến hóa qua các lần push</SectionLabel>
          <ProsePre>{evo}</ProsePre>
        </div>
      ) : null}
    </div>
  );
}

const RUBRIC_LABELS: Array<{ key: "R1_01" | "R1_02" | "R1_03" | "R1_04" | "R1_05"; label: string }> = [
  { key: "R1_01", label: "R1_01 · Domain fit" },
  { key: "R1_02", label: "R1_02 · Data pipeline" },
  { key: "R1_03", label: "R1_03 · Retrieval" },
  { key: "R1_04", label: "R1_04 · Intent & prompting" },
  { key: "R1_05", label: "R1_05 · Slide & trình bày" },
];

function renderCriteriaCommentsPerPush(structuredOutput: Record<string, unknown> | null) {
  const criteria = extractCriteriaComments(structuredOutput);
  if (!criteria) return null;

  const hasAny = RUBRIC_LABELS.some(({ key }) => Boolean(criteria[key]));
  if (!hasAny) return null;

  return (
    <div className="criteria-box criteria-per-push">
      <span className="criteria-title">Tiêu chí (R1) — áp dụng cho push này</span>
      {RUBRIC_LABELS.map(({ key, label }) =>
        criteria[key] ? (
          <div key={key} style={{ marginTop: 12 }}>
            <span className="criteria-item-label">{label}</span>
            <ProsePre>{criteria[key] as string}</ProsePre>
          </div>
        ) : null
      )}
    </div>
  );
}

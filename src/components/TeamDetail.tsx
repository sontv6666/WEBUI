import type { AssessmentBlock, InventoryExhaustive, ReviewItem } from "../types/reviews";
import {
  extractAssessment,
  extractCriteriaComments,
  extractInventoryExhaustive,
  extractOverallPicture,
  extractPromptRefinement,
  extractSuggestedTestCases,
  fallbackSummary,
  reviewKindOf,
  shortSha,
  toAbsoluteTime,
  toRelativeTime,
} from "../types/reviews";
import { IdentityPlaceholder, MetaChips, ProjectToolsPanels, ProsePre, SectionLabel, Skeleton } from "./Presentation";

/** Ưu tiên aggregate; thiếu thì lấy từ các bản per-push (thường là push mới nhất đã có dữ liệu). */
function resolveTeamIdentity(aggregateReview: ReviewItem | null, perPushRows: ReviewItem[]) {
  const agg = extractOverallPicture(aggregateReview?.structured_output ?? null);
  let projectAbout = (agg?.project_about ?? "").trim();
  let toolsBullets = (agg?.tools_plain_bullets ?? "").trim();
  if (!projectAbout || !toolsBullets) {
    for (const row of perPushRows) {
      const op = extractOverallPicture(row.structured_output);
      if (!projectAbout && (op?.project_about ?? "").trim()) projectAbout = (op?.project_about ?? "").trim();
      if (!toolsBullets && (op?.tools_plain_bullets ?? "").trim()) toolsBullets = (op?.tools_plain_bullets ?? "").trim();
      if (projectAbout && toolsBullets) break;
    }
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
  aggregateReview,
  loading,
  loadingAggregate,
}: {
  teamId: string;
  teams: Array<{ teamId: string; repoName?: string }>;
  onTeamChange: (teamId: string) => void;
  onOpenTeam?: (teamId: string) => void;
  rows: ReviewItem[];
  aggregateReview: ReviewItem | null;
  loading: boolean;
  loadingAggregate?: boolean;
}) {
  const identity = resolveTeamIdentity(aggregateReview, rows);
  const hasIdentity = Boolean(identity.project_about || identity.tools_plain_bullets);

  return (
    <section className="panel team-panel">
      <div className="team-header">
        <h2 className="panel-title">Đội &amp; hệ thống</h2>
        <select value={teamId} onChange={(e) => onTeamChange(e.target.value)} aria-label="Chọn đội">
          {teams.map((team) => (
            <option key={team.teamId} value={team.teamId}>
              {team.repoName ? `${team.teamId} · ${team.repoName}` : team.teamId}
            </option>
          ))}
        </select>
      </div>

      {teamId ? (
        <div className="identity-first-block">
          <h3 className="system-hero-title">Hệ thống — mô tả &amp; công cụ</h3>
          <p className="team-context-intro">
            Khối đầu là <strong>hệ thống</strong> (phạm vi, chức năng) và <strong>công cụ</strong> team đang dùng. Tiếp theo là{" "}
            <strong>tổng quan hệ thống</strong> theo lịch sử nhiều push. Phần <strong>tiêu chí R1</strong> nằm dưới —{" "}
            <em>mỗi lần push một bản nhận xét</em>.
          </p>
          {(loadingAggregate || loading) && !hasIdentity ? (
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

      {teamId && (
        <div className="aggregate-panel">
          <h3 className="aggregate-heading">Tổng quan hệ thống</h3>
          <p className="team-context-intro" style={{ marginTop: 0 }}>
            Tổng hợp cấp team: diễn biến và trạng thái hiện tại của <strong>hệ thống</strong>. Không thay cho rubric R1 ở từng push.
          </p>
          {loadingAggregate && (
            <div className="state-row">
              <Skeleton className="skeleton-line" style={{ flex: 1, height: 16 }} />
            </div>
          )}
          {!loadingAggregate && !aggregateReview && (
            <p className="state">Chưa có bản tổng hợp cấp team (hoặc chưa chạy xong).</p>
          )}
          {!loadingAggregate && aggregateReview && (
            <article className="timeline-item aggregate-card" data-status={aggregateReview.status}>
              <div className="line">
                <strong>{reviewKindOf(aggregateReview)}</strong>
                <span className={`badge ${aggregateReview.status}`}>{aggregateReview.status}</span>
              </div>
              <MetaChips
                items={[
                  { label: "Repo", value: aggregateReview.repo_name || "—" },
                  { label: "Snapshot", value: shortSha(aggregateReview.commit_sha) },
                  { label: "Cập nhật", value: `${toRelativeTime(aggregateReview.updated_at)} · ${toAbsoluteTime(aggregateReview.updated_at)}` },
                  { label: "RAG", value: aggregateReview.rag_level || "—" },
                ]}
              />
              <p className="summary-text">{aggregateReview.push_summary || fallbackSummary(aggregateReview.status)}</p>
              {renderExtendedLlmSections(aggregateReview.structured_output)}
              {renderHistoricalSynthesis(aggregateReview.structured_output)}
              <details className="json-details">
                <summary>Structured output — aggregate (JSON)</summary>
                <pre>{JSON.stringify(aggregateReview.structured_output || {}, null, 2)}</pre>
              </details>
            </article>
          )}
        </div>
      )}

      <h3 className="subsection-title">Theo từng lần push</h3>
      <p className="team-context-intro" style={{ marginTop: -6, marginBottom: 14 }}>
        Mỗi thẻ = một push đã review. <strong>R1_01–R1_05</strong> là nhận xét tiêu chí <strong>cho push đó</strong>, tách khỏi tổng quan hệ thống phía trên.
      </p>
      {loading && (
        <div aria-busy="true">
          <Skeleton className="skeleton-line" style={{ height: 120, marginBottom: 12 }} />
          <Skeleton className="skeleton-line" style={{ height: 120, marginBottom: 12 }} />
        </div>
      )}
      {!teamId && !loading && <p className="state">Chưa chọn đội.</p>}
      {teamId && !loading && rows.length === 0 && <p className="state">Đội này chưa có bản ghi review.</p>}
      {!loading &&
        rows.map((item) => {
          const op = extractOverallPicture(item.structured_output);
          return (
            <article
              key={`${item.team_id}-${item.commit_sha}-${item.updated_at}`}
              className={`timeline-item ${onOpenTeam ? "clickable" : ""}`}
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
              <div className="line">
                <strong>Commit {shortSha(item.commit_sha)}</strong>
                <span className="badge subtle">{reviewKindOf(item)}</span>
                <span className={`badge ${item.status}`}>{item.status}</span>
              </div>
              <MetaChips
                items={[
                  { label: "Repo", value: item.repo_name || "—" },
                  { label: "Commit", value: shortSha(item.commit_sha) },
                  { label: "Cập nhật", value: `${toRelativeTime(item.updated_at)} · ${toAbsoluteTime(item.updated_at)}` },
                  { label: "RAG", value: item.rag_level || "—" },
                  { label: "Input", value: String(item.input_code_length ?? 0) },
                ]}
              />
              <ProjectToolsPanels projectAbout={op?.project_about} toolsBullets={op?.tools_plain_bullets} />
              <p className="summary-text">{item.push_summary || fallbackSummary(item.status)}</p>
              {renderExtendedLlmSections(item.structured_output)}
              {renderCriteriaCommentsPerPush(item.structured_output)}
              <details className="json-details">
                <summary>Structured output — push này (JSON)</summary>
                <pre>{JSON.stringify(item.structured_output || {}, null, 2)}</pre>
              </details>
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
  { key: "context_and_fit", label: "Ngữ cảnh & đề bài" },
  { key: "source_structure", label: "Cấu trúc source" },
  { key: "completeness", label: "Độ hoàn thiện" },
  { key: "security", label: "Bảo mật" },
];

function renderExtendedLlmSections(structuredOutput: Record<string, unknown> | null) {
  const inv = extractInventoryExhaustive(structuredOutput);
  const assessment = extractAssessment(structuredOutput);
  const tests = extractSuggestedTestCases(structuredOutput);
  const promptHint = extractPromptRefinement(structuredOutput);

  const hasInventory =
    inv &&
    INVENTORY_LABELS.some(({ key }) => Array.isArray(inv[key]) && (inv[key] as string[]).length > 0);
  const hasAssessment =
    assessment && ASSESSMENT_LABELS.some(({ key }) => Boolean((assessment[key] as string | undefined)?.trim()));
  const hasTests = tests && tests.length > 0;
  if (!hasInventory && !hasAssessment && !hasTests && !promptHint) return null;

  return (
    <div className="criteria-box llm-extended-block">
      {hasInventory && inv ? (
        <div style={{ marginBottom: 14 }}>
          <SectionLabel icon="◇">Danh mục công nghệ (liệt kê đầy đủ)</SectionLabel>
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
        <div style={{ marginBottom: 14 }}>
          <SectionLabel icon="◎">Đánh giá</SectionLabel>
          {ASSESSMENT_LABELS.map(({ key, label }) => {
            const text = (assessment[key] as string | undefined)?.trim();
            if (!text) return null;
            return (
              <div key={key} style={{ marginTop: 10 }}>
                <span className="criteria-item-label">{label}</span>
                <ProsePre>{text}</ProsePre>
              </div>
            );
          })}
        </div>
      ) : null}
      {hasTests && tests ? (
        <div style={{ marginBottom: promptHint ? 14 : 0 }}>
          <SectionLabel icon="✓">Gợi ý test case</SectionLabel>
          <ol className="test-case-list">
            {tests.map((t, i) => (
              <li key={i}>
                <ProsePre>{t}</ProsePre>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
      {promptHint ? (
        <div>
          <SectionLabel icon="→">Gợi ý tối ưu prompt</SectionLabel>
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

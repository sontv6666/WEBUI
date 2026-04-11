import type { ReviewItem } from "../types/reviews";
import { extractCriteriaComments, fallbackSummary, reviewKindOf, shortSha, toAbsoluteTime, toRelativeTime } from "../types/reviews";

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
  teams: Array<{ teamId: string }>;
  onTeamChange: (teamId: string) => void;
  onOpenTeam?: (teamId: string) => void;
  rows: ReviewItem[];
  aggregateReview: ReviewItem | null;
  loading: boolean;
  loadingAggregate?: boolean;
}) {
  return (
    <section className="panel team-panel">
      <div className="team-header">
        <h2>Team History</h2>
        <select value={teamId} onChange={(e) => onTeamChange(e.target.value)}>
          {teams.map((team) => (
            <option key={team.teamId} value={team.teamId}>
              {team.teamId}
            </option>
          ))}
        </select>
      </div>

      {teamId && (
        <div className="aggregate-panel">
          <h3>Tong quan he thong (team aggregate)</h3>
          {loadingAggregate && <p className="state">Dang tai tong hop...</p>}
          {!loadingAggregate && !aggregateReview && <p className="state">Chua co ban tong hop team.</p>}
          {!loadingAggregate && aggregateReview && (
            <article className="timeline-item aggregate-card">
              <div className="line">
                <strong>{reviewKindOf(aggregateReview)}</strong>
                <span className={`badge ${aggregateReview.status}`}>{aggregateReview.status}</span>
              </div>
              <div className="meta">
                <span>Repo: {aggregateReview.repo_name || "-"}</span>
                <span>Snapshot commit: {shortSha(aggregateReview.commit_sha)}</span>
                <span title={toAbsoluteTime(aggregateReview.updated_at)}>{toRelativeTime(aggregateReview.updated_at)}</span>
                <span>RAG: {aggregateReview.rag_level || "-"}</span>
              </div>
              <p>{aggregateReview.push_summary || fallbackSummary(aggregateReview.status)}</p>
              {renderHistoricalSynthesis(aggregateReview.structured_output)}
              {renderCriteriaComments(aggregateReview.structured_output)}
              <details className="json-details">
                <summary>Structured Output</summary>
                <pre>{JSON.stringify(aggregateReview.structured_output || {}, null, 2)}</pre>
              </details>
            </article>
          )}
        </div>
      )}

      <h3 className="subsection-title">Lich su tung lan push (per commit)</h3>
      {loading && <p className="state">Loading team history...</p>}
      {!teamId && !loading && <p className="state">Chua co team duoc chon.</p>}
      {teamId && !loading && rows.length === 0 && <p className="state">Team nay chua co review events.</p>}
      {!loading &&
        rows.map((item) => (
          <article
            key={`${item.team_id}-${item.commit_sha}-${item.updated_at}`}
            className={`timeline-item ${onOpenTeam ? "clickable" : ""}`}
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
              <strong>{item.team_id}</strong>
              <span className="badge subtle">{reviewKindOf(item)}</span>
              <span className={`badge ${item.status}`}>{item.status}</span>
            </div>
            <div className="meta">
              <span>Repo: {item.repo_name || "-"}</span>
              <span>Commit: {shortSha(item.commit_sha)}</span>
              <span title={toAbsoluteTime(item.updated_at)}>{toRelativeTime(item.updated_at)}</span>
              <span>RAG: {item.rag_level || "-"}</span>
              <span>Input size: {item.input_code_length ?? 0}</span>
            </div>
            <p>{item.push_summary || fallbackSummary(item.status)}</p>
            {renderCriteriaComments(item.structured_output)}
            <details className="json-details">
              <summary>Structured Output</summary>
              <pre>{JSON.stringify(item.structured_output || {}, null, 2)}</pre>
            </details>
          </article>
        ))}
    </section>
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
        <p>
          <b>Tong hop lich su:</b> {hist}
        </p>
      ) : null}
      {typeof evo === "string" && evo ? (
        <p>
          <b>Tien hoa qua cac lan push:</b> {evo}
        </p>
      ) : null}
    </div>
  );
}

function renderCriteriaComments(structuredOutput: Record<string, unknown> | null) {
  const criteria = extractCriteriaComments(structuredOutput);
  if (!criteria) return null;

  const entries: Array<{ key: "R1_01" | "R1_02" | "R1_03" | "R1_04" | "R1_05"; label: string }> = [
    { key: "R1_01", label: "R1_01 - Domain fit" },
    { key: "R1_02", label: "R1_02 - Data pipeline" },
    { key: "R1_03", label: "R1_03 - Retrieval" },
    { key: "R1_04", label: "R1_04 - Intent & Prompting" },
    { key: "R1_05", label: "R1_05 - Slide & Presentation" },
  ];

  const hasAny = entries.some(({ key }) => Boolean(criteria[key]));
  if (!hasAny) return null;

  return (
    <div className="criteria-box">
      <strong>Nhan xet theo tieu chi:</strong>
      {entries.map(({ key, label }) =>
        criteria[key] ? (
          <p key={key}>
            <b>{label}:</b> {criteria[key]}
          </p>
        ) : null
      )}
    </div>
  );
}


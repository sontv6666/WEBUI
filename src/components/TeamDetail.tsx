import type { ReviewItem } from "../types/reviews";
import { extractCriteriaComments, fallbackSummary, shortSha, toAbsoluteTime, toRelativeTime } from "../types/reviews";

export function TeamDetail({
  teamId,
  teams,
  onTeamChange,
  rows,
  loading,
}: {
  teamId: string;
  teams: Array<{ teamId: string }>;
  onTeamChange: (teamId: string) => void;
  rows: ReviewItem[];
  loading: boolean;
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
      {loading && <p className="state">Loading team history...</p>}
      {!teamId && !loading && <p className="state">Chua co team duoc chon.</p>}
      {teamId && !loading && rows.length === 0 && <p className="state">Team nay chua co review events.</p>}
      {!loading &&
        rows.map((item) => (
          <article key={`${item.team_id}-${item.commit_sha}-${item.updated_at}`} className="timeline-item">
            <div className="line">
              <strong>{item.team_id}</strong>
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

function renderCriteriaComments(structuredOutput: Record<string, unknown> | null) {
  const criteria = extractCriteriaComments(structuredOutput);
  if (!criteria) return null;

  const entries: Array<{ key: keyof CriteriaComments; label: string }> = [
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


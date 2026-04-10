import { useMemo, useState } from "react";
import type { ReviewItem, TeamLatestReview } from "../types/reviews";
import { extractCriteriaComments, shortSha, toAbsoluteTime, toRelativeTime } from "../types/reviews";

export function TeamsTable({
  rows: latestRows,
  commits,
  onOpenTeam,
  loading,
}: {
  rows: TeamLatestReview[];
  commits: ReviewItem[];
  onOpenTeam?: (teamId: string) => void;
  loading: boolean;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");

  const grouped = useMemo(() => {
    const commitsByTeam = new Map<string, ReviewItem[]>();
    for (const item of commits) {
      const bucket = commitsByTeam.get(item.team_id) || [];
      bucket.push(item);
      commitsByTeam.set(item.team_id, bucket);
    }

    const q = query.trim().toLowerCase();
    return latestRows
      .filter((item) => {
      const statusPass = status === "all" ? true : item.status === status;
      const text = `${item.team_id} ${item.repo_name || ""} ${item.push_summary || ""} ${item.commit_sha || ""}`.toLowerCase();
      return statusPass && text.includes(q);
      })
      .map((team) => ({
        team,
        commits: commitsByTeam.get(team.team_id) || [],
      }));
  }, [query, latestRows, status, commits]);

  return (
    <>
      <div className="controls teams-controls sticky-filters">
        <input
          placeholder="Search team / repo / commit / summary..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">All status</option>
          <option value="llm_started">AI started</option>
          <option value="done">Done</option>
          <option value="error">Error</option>
        </select>
      </div>

      <div className="team-groups">
        {loading && <p className="state">Loading teams overview...</p>}
        {!loading &&
          grouped.map(({ team, commits }) => (
            <article
              key={`group-${team.team_id}`}
              className={`team-group-card status-${team.status} ${onOpenTeam ? "clickable" : ""}`}
              onClick={onOpenTeam ? () => onOpenTeam(team.team_id) : undefined}
            >
              <div className="line">
                <h3>{team.team_id}</h3>
                <span className={`badge ${team.status}`}>{team.status}</span>
              </div>
              <div className="meta">
                <span>Repo: {team.repo_name || "-"}</span>
                <span>Latest commit: {shortSha(team.commit_sha || null)}</span>
                <span>Updated: {toAbsoluteTime(team.updated_at)}</span>
                <span>Total commits: {commits.length}</span>
              </div>
              <p className="team-summary">{team.push_summary || "Chua co binh luan AI."}</p>

              <details className="team-commits-details" open>
                <summary>Danh sach commit da nhan xet</summary>
                <div className="team-commits-list">
                  {commits.length === 0 && <p className="state">Chua co commit trong nhom nay.</p>}
                  {commits.map((commit) => (
                    <div key={`${commit.team_id}-${commit.commit_sha}-${commit.updated_at}`} className="commit-card">
                      <div className="line">
                        <strong>{shortSha(commit.commit_sha)}</strong>
                        <span className={`badge ${commit.status}`}>{commit.status}</span>
                      </div>
                      <div className="meta">
                        <span>{toRelativeTime(commit.updated_at)}</span>
                        <span>{toAbsoluteTime(commit.updated_at)}</span>
                        <span>RAG: {commit.rag_level || "-"}</span>
                      </div>
                      <p>{commit.push_summary || "Khong co summary."}</p>
                      <CriteriaCommentsBlock structuredOutput={commit.structured_output} />
                    </div>
                  ))}
                </div>
              </details>
            </article>
          ))}
        {!loading && grouped.length === 0 && <p className="state">No matching team records.</p>}
      </div>
    </>
  );
}

function CriteriaCommentsBlock({ structuredOutput }: { structuredOutput: Record<string, unknown> | null }) {
  const criteria = extractCriteriaComments(structuredOutput);
  if (!criteria) return null;

  const lines = [
    ["R1_01", criteria.R1_01],
    ["R1_02", criteria.R1_02],
    ["R1_03", criteria.R1_03],
    ["R1_04", criteria.R1_04],
    ["R1_05", criteria.R1_05],
  ].filter(([, value]) => Boolean(value));

  if (lines.length === 0) return null;

  return (
    <div className="criteria-box">
      <strong>Binh luan theo tieu chi</strong>
      {lines.map(([key, value]) => (
        <p key={key}>
          <b>{key}:</b> {value}
        </p>
      ))}
    </div>
  );
}


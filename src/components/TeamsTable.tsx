import { useMemo, useState } from "react";
import type { TeamLatestReview } from "../types/reviews";
import { shortSha, toAbsoluteTime } from "../types/reviews";

export function TeamsTable({
  rows,
  loading,
}: {
  rows: TeamLatestReview[];
  loading: boolean;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((item) => {
      const statusPass = status === "all" ? true : item.status === status;
      const text = `${item.team_id} ${item.repo_name || ""} ${item.push_summary || ""} ${item.commit_sha || ""}`.toLowerCase();
      return statusPass && text.includes(q);
    });
  }, [query, rows, status]);

  return (
    <>
      <div className="controls teams-controls">
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

      <div className="teams-table-wrap">
        <table className="teams-table">
          <thead>
            <tr>
              <th>Team</th>
              <th>Status</th>
              <th>Repo</th>
              <th>Commit</th>
              <th>RAG</th>
              <th>Summary</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {!loading &&
              filtered.map((item) => (
                <tr key={`table-${item.team_id}`}>
                  <td>{item.team_id}</td>
                  <td>
                    <span className={`badge ${item.status}`}>{item.status}</span>
                  </td>
                  <td>{item.repo_name || "-"}</td>
                  <td>
                    <code>{shortSha(item.commit_sha || null)}</code>
                  </td>
                  <td>{item.rag_level || "-"}</td>
                  <td>{item.push_summary || "Chua co du lieu"}</td>
                  <td>{toAbsoluteTime(item.updated_at)}</td>
                </tr>
              ))}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={7}>No matching team records.</td>
              </tr>
            )}
            {loading && (
              <tr>
                <td colSpan={7}>Loading teams overview...</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}


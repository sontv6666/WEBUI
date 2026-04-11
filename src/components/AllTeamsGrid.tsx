import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { ReviewItem, TeamLatestReview } from "../types/reviews";
import { extractOverallPicture, reviewKindOf, shortSha } from "../types/reviews";
import { GLOBAL_FEED_QUERY_LIMIT } from "../hooks/useReviewsData";
import { MetaChips } from "./Presentation";

function pickLatestInBucket(rows: ReviewItem[]): ReviewItem | null {
  if (rows.length === 0) return null;
  return rows.reduce((best, r) =>
    new Date(r.updated_at).getTime() >= new Date(best.updated_at).getTime() ? r : best
  );
}

function truncate(s: string, max: number) {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

export function AllTeamsGrid({
  latestRows,
  commits,
  loading,
}: {
  latestRows: TeamLatestReview[];
  commits: ReviewItem[];
  loading: boolean;
}) {
  const [query, setQuery] = useState("");

  const byTeam = useMemo(() => {
    const map = new Map<string, ReviewItem[]>();
    for (const item of commits) {
      const bucket = map.get(item.team_id) || [];
      bucket.push(item);
      map.set(item.team_id, bucket);
    }
    return map;
  }, [commits]);

  const cards = useMemo(() => {
    const q = query.trim().toLowerCase();
    return latestRows
      .map((team) => {
        const teamCommits = byTeam.get(team.team_id) ?? [];
        const perPushCount = teamCommits.filter((c) => reviewKindOf(c) === "per_push").length;
        const latestRow = pickLatestInBucket(teamCommits);
        const op = extractOverallPicture(latestRow?.structured_output ?? null);
        const systemTeaser = (op?.project_about ?? "").trim() || (team.push_summary ?? "").trim() || "—";
        const toolsHint = (op?.tools_plain_bullets ?? "").trim();
        return {
          team,
          perPushCount,
          latestRow,
          op,
          systemTeaser,
          toolsHint,
          searchBlob: `${team.team_id} ${team.repo_name ?? ""} ${team.push_summary ?? ""} ${systemTeaser} ${toolsHint}`.toLowerCase(),
        };
      })
      .filter((x) => (q ? x.searchBlob.includes(q) : true));
  }, [latestRows, byTeam, query]);

  return (
    <>
      <div className="controls all-teams-controls">
        <input
          placeholder="Tìm team, repo, mô tả hệ thống…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Tìm kiếm đội"
        />
      </div>
      <p className="all-teams-disclaimer page-section-desc">
        Số commit mỗi đội đếm trong <strong>tối đa {GLOBAL_FEED_QUERY_LIMIT}</strong> bản ghi mới nhất đã tải; nếu DB lớn hơn, số có thể thấp hơn thực tế.
      </p>
      {loading && <p className="state">Đang tải…</p>}
      {!loading && cards.length === 0 && <p className="state">Không có đội phù hợp.</p>}
      {!loading && cards.length > 0 && (
        <div className="all-teams-grid" role="list">
          {cards.map(({ team, perPushCount, latestRow, systemTeaser, toolsHint }) => (
            <article key={team.team_id} className="all-teams-card" role="listitem">
              <div className="all-teams-card__head">
                <Link className="all-teams-card__title-link" to={`/teams/${encodeURIComponent(team.team_id)}`}>
                  <span className="all-teams-card__team-id">{team.team_id}</span>
                  {team.repo_name ? (
                    <span className="all-teams-card__repo" title={team.repo_name}>
                      {truncate(team.repo_name, 42)}
                    </span>
                  ) : null}
                </Link>
              </div>
              <MetaChips
                items={[
                  { label: "Push (trong phạm vi tải)", value: String(perPushCount) },
                  { label: "RAG", value: team.rag_level || "—" },
                  {
                    label: "Cập nhật",
                    value: latestRow ? shortSha(latestRow.commit_sha) : shortSha(team.commit_sha),
                  },
                ]}
              />
              <p className="all-teams-card__teaser">{truncate(systemTeaser, 160)}</p>
              <details className="all-teams-card__details">
                <summary>Chi tiết ngắn</summary>
                <div className="all-teams-card__details-body">
                  {toolsHint ? (
                    <p className="all-teams-card__tools">
                      <strong>Công cụ:</strong> {truncate(toolsHint, 400)}
                    </p>
                  ) : null}
                  <p className="all-teams-card__summary-full">
                    <strong>Tóm tắt (mới nhất):</strong> {team.push_summary || "—"}
                  </p>
                  <Link className="all-teams-card__cta" to={`/teams/${encodeURIComponent(team.team_id)}`}>
                    Mở trang chi tiết đội →
                  </Link>
                </div>
              </details>
            </article>
          ))}
        </div>
      )}
    </>
  );
}

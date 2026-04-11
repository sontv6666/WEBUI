import { useMemo, useState } from "react";
import type { ReviewItem, TeamLatestReview } from "../types/reviews";
import { extractCriteriaComments, extractOverallPicture, shortSha, toAbsoluteTime, toRelativeTime } from "../types/reviews";
import { MetaChips, ProjectToolsPanels, ProsePre, SectionLabel } from "./Presentation";

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
          placeholder="Tìm team, repo, commit, tóm tắt…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Tìm kiếm đội"
        />
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Lọc trạng thái">
          <option value="all">Mọi trạng thái</option>
          <option value="llm_started">AI đang xử lý</option>
          <option value="done">Hoàn thành</option>
          <option value="error">Lỗi</option>
        </select>
      </div>

      <div className="team-groups">
        {loading && <p className="state">Đang tải danh sách đội…</p>}
        {!loading &&
          grouped.map(({ team, commits: teamCommits }) => {
            const latestOp = extractOverallPicture(
              teamCommits.find((c) => c.commit_sha === team.commit_sha)?.structured_output ?? null
            );
            return (
              <article
                key={`group-${team.team_id}`}
                className={`team-group-card status-${team.status} ${onOpenTeam ? "clickable" : ""}`}
                onClick={onOpenTeam ? () => onOpenTeam(team.team_id) : undefined}
                role={onOpenTeam ? "button" : undefined}
                tabIndex={onOpenTeam ? 0 : undefined}
                onKeyDown={
                  onOpenTeam
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") onOpenTeam(team.team_id);
                      }
                    : undefined
                }
              >
                <div className="line">
                  <h3>{team.team_id}</h3>
                  <span className={`badge ${team.status}`}>{team.status}</span>
                </div>
                <MetaChips
                  items={[
                    { label: "Repo", value: team.repo_name || "—" },
                    { label: "Commit mới nhất", value: shortSha(team.commit_sha || null) },
                    { label: "Cập nhật", value: toAbsoluteTime(team.updated_at) },
                    { label: "Số push đã review", value: String(teamCommits.length) },
                  ]}
                />
                {(latestOp?.project_about?.trim() || latestOp?.tools_plain_bullets?.trim()) ? (
                  <>
                    <p className="system-snapshot-hint">Hệ thống (theo push mới nhất có dữ liệu)</p>
                    <ProjectToolsPanels projectAbout={latestOp?.project_about} toolsBullets={latestOp?.tools_plain_bullets} />
                  </>
                ) : null}
                <p className="team-summary">{team.push_summary || "Chưa có tóm tắt AI."}</p>

                <details className="team-commits-details" open>
                  <summary>Các lần push đã nhận xét</summary>
                  <div className="team-commits-list">
                    {teamCommits.length === 0 && <p className="state">Chưa có bản ghi per-push cho đội này.</p>}
                    {teamCommits.map((commit) => {
                      const op = extractOverallPicture(commit.structured_output);
                      return (
                        <div key={`${commit.team_id}-${commit.commit_sha}-${commit.updated_at}`} className="commit-card">
                          <div className="line">
                            <strong>{shortSha(commit.commit_sha)}</strong>
                            <span className={`badge ${commit.status}`}>{commit.status}</span>
                          </div>
                          <MetaChips
                            items={[
                              { label: "Cập nhật", value: `${toRelativeTime(commit.updated_at)} · ${toAbsoluteTime(commit.updated_at)}` },
                              { label: "RAG", value: commit.rag_level || "—" },
                            ]}
                          />
                          <ProjectToolsPanels projectAbout={op?.project_about} toolsBullets={op?.tools_plain_bullets} />
                          <p>{commit.push_summary || "Không có tóm tắt."}</p>
                          <CriteriaCommentsBlock structuredOutput={commit.structured_output} />
                        </div>
                      );
                    })}
                  </div>
                </details>
              </article>
            );
          })}
        {!loading && grouped.length === 0 && <p className="state">Không có đội phù hợp bộ lọc.</p>}
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
    <div className="criteria-box criteria-per-push" style={{ marginTop: 12 }}>
      <SectionLabel icon="¶">Tiêu chí (R1) — push này</SectionLabel>
      {lines.map(([key, value]) => (
        <div key={key} style={{ marginTop: 8 }}>
          <span className="criteria-item-label">{key}</span>
          <ProsePre>{value as string}</ProsePre>
        </div>
      ))}
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import type { ReviewItem, TeamLatestReview } from "../types/reviews";
import {
  extractBatchReviewMeta,
  extractOverallPicture,
  formatBatchReviewDisplayValue,
  formatBatchedShaPreview,
  formatStatusLabel,
  reviewKindOf,
  shouldShowReviewStatusBadge,
  shortSha,
  toAbsoluteTime,
  toRelativeTime,
} from "../types/reviews";
import { computePageCount, PaginationBar, slicePage } from "./Pagination";
import { IdentityPlaceholder, MetaChips, ProjectToolsPanels } from "./Presentation";
import { SmbScaleAdvisoryPanel, TeamAggregateCriteriaSections } from "./RubricAndAdvisoryPanels";

const TEAMS_PAGE_SIZE = 6;

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
  const [searchInput, setSearchInput] = useState("");
  /** Lọc danh sách — áp khi bấm Tìm hoặc Enter */
  const [query, setQuery] = useState("");
  const [teamsPage, setTeamsPage] = useState(1);
  /** Mặc định thu gọn: chỉ mô tả hệ thống + công cụ; mở rộng xem repo, tóm tắt, tiêu chí, danh sách push. */
  const [expandedTeams, setExpandedTeams] = useState<Record<string, boolean>>({});

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
        const text = `${item.team_id} ${item.repo_name || ""} ${item.push_summary || ""} ${item.commit_sha || ""}`.toLowerCase();
        return text.includes(q);
      })
      .map((team) => ({
        team,
        commits: commitsByTeam.get(team.team_id) || [],
      }));
  }, [query, latestRows, commits]);

  const teamsPageCount = useMemo(() => computePageCount(grouped.length, TEAMS_PAGE_SIZE), [grouped.length]);

  const paginatedGroups = useMemo(() => slicePage(grouped, teamsPage, TEAMS_PAGE_SIZE), [grouped, teamsPage]);

  useEffect(() => {
    setTeamsPage(1);
  }, [query]);

  useEffect(() => {
    if (teamsPage > teamsPageCount) setTeamsPage(teamsPageCount);
  }, [teamsPage, teamsPageCount]);

  return (
    <>
      <form
        className="controls controls--search teams-controls sticky-filters"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(searchInput.trim());
        }}
      >
        <input
          name="q"
          placeholder="Tìm team, repo, commit, tóm tắt…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          aria-label="Tìm kiếm đội"
          autoComplete="off"
        />
        <button type="submit" className="controls-search-btn">
          Tìm
        </button>
      </form>

      <p className="teams-table-intro page-section-desc">
        Mỗi đội mặc định chỉ hiện <strong>mô tả hệ thống</strong> và <strong>công cụ</strong> — dùng{" "}
        <strong>Mở rộng</strong> hoặc <strong>Chi tiết đội</strong> để xem thêm · tối đa{" "}
        <strong>{TEAMS_PAGE_SIZE}</strong> đội/trang.
      </p>

      <div className="team-groups">
        {loading && <p className="state">Đang tải danh sách đội…</p>}
        {!loading &&
          paginatedGroups.map(({ team, commits: teamCommits }) => {
            const latestOp = extractOverallPicture(
              teamCommits.find((c) => c.commit_sha === team.commit_sha)?.structured_output ?? null
            );
            const latestByTime = teamCommits.reduce<ReviewItem | null>((best, c) => {
              if (!best) return c;
              return new Date(c.updated_at).getTime() >= new Date(best.updated_at).getTime() ? c : best;
            }, null);
            const latestBatchMeta = extractBatchReviewMeta(latestByTime?.structured_output ?? null);
            const latestBatchValue = formatBatchReviewDisplayValue(latestBatchMeta);
            const latestBatchShas = formatBatchedShaPreview(latestBatchMeta.batchedCommitShas);
            const aggregateRow = teamCommits.find((c) => reviewKindOf(c) === "team_aggregate") ?? null;
            const teamMetaChips: Array<{ label: string; value: string }> = [
              { label: "Repo", value: team.repo_name || "—" },
              { label: "Commit mới nhất", value: shortSha(team.commit_sha || null) },
              { label: "Cập nhật", value: toAbsoluteTime(team.updated_at) },
              { label: "Commit đã lưu (DB)", value: String(teamCommits.length) },
            ];
            if (latestBatchValue) teamMetaChips.push({ label: "Đợt gần nhất", value: latestBatchValue });
            if (latestBatchShas) teamMetaChips.push({ label: "SHA trong đợt", value: latestBatchShas });
            const isExpanded = expandedTeams[team.team_id] ?? false;
            const hasSystemSnapshot =
              Boolean(latestOp?.project_about?.trim()) || Boolean(latestOp?.tools_plain_bullets?.trim());

            return (
              <article
                key={`group-${team.team_id}`}
                className={`team-group-card status-${team.status} ${isExpanded ? "team-group-card--expanded" : "team-group-card--collapsed"}`}
              >
                <div className="line">
                  <h3>{team.team_id}</h3>
                  {shouldShowReviewStatusBadge(team.status) ? (
                    <span className={`badge ${team.status}`}>{formatStatusLabel(team.status)}</span>
                  ) : null}
                </div>

                <p className="system-snapshot-hint">Hệ thống (theo push mới nhất có dữ liệu)</p>
                {hasSystemSnapshot ? (
                  <ProjectToolsPanels projectAbout={latestOp?.project_about} toolsBullets={latestOp?.tools_plain_bullets} />
                ) : (
                  <div className="team-group-card__identity-placeholder">
                    <IdentityPlaceholder />
                  </div>
                )}

                {isExpanded ? (
                  <>
                    <MetaChips items={teamMetaChips} />
                    <p className="team-summary">{team.push_summary || "Chưa có tóm tắt AI."}</p>

                    {aggregateRow ? (
                      <div className="team-card-aggregate-rubric">
                        <p className="system-snapshot-hint">Tiêu chí &amp; gợi ý (tổng hợp đội)</p>
                        <TeamAggregateCriteriaSections structuredOutput={aggregateRow.structured_output} />
                        <SmbScaleAdvisoryPanel structuredOutput={aggregateRow.structured_output} />
                      </div>
                    ) : null}

                    <details
                      className="team-commits-details"
                      open
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      <summary>Các lần push đã nhận xét</summary>
                      <div className="team-commits-list">
                        {teamCommits.filter((c) => reviewKindOf(c) !== "team_aggregate").length === 0 && (
                          <p className="state">Chưa có bản ghi per-push cho đội này.</p>
                        )}
                        {teamCommits
                          .filter((c) => reviewKindOf(c) !== "team_aggregate")
                          .map((commit) => {
                            const op = extractOverallPicture(commit.structured_output);
                            const batchMeta = extractBatchReviewMeta(commit.structured_output);
                            const batchValue = formatBatchReviewDisplayValue(batchMeta);
                            const batchShaPreview = formatBatchedShaPreview(batchMeta.batchedCommitShas);
                            const commitChips: Array<{ label: string; value: string }> = [
                              {
                                label: "Cập nhật",
                                value: `${toRelativeTime(commit.updated_at)} · ${toAbsoluteTime(commit.updated_at)}`,
                              },
                              { label: "RAG", value: commit.rag_level || "—" },
                            ];
                            if (batchValue) commitChips.push({ label: "Đợt review", value: batchValue });
                            if (batchShaPreview) commitChips.push({ label: "SHA trong đợt", value: batchShaPreview });
                            return (
                              <div key={`${commit.team_id}-${commit.commit_sha}-${commit.updated_at}`} className="commit-card">
                                <div className="line">
                                  <strong>{shortSha(commit.commit_sha)}</strong>
                                  {shouldShowReviewStatusBadge(commit.status) ? (
                                    <span className={`badge ${commit.status}`}>{formatStatusLabel(commit.status)}</span>
                                  ) : null}
                                </div>
                                <MetaChips items={commitChips} />
                                <ProjectToolsPanels projectAbout={op?.project_about} toolsBullets={op?.tools_plain_bullets} />
                                <p>{commit.push_summary || "Không có tóm tắt."}</p>
                              </div>
                            );
                          })}
                      </div>
                    </details>
                  </>
                ) : null}

                <div className="team-group-card__actions">
                  <button
                    type="button"
                    className="team-group-card__expand-btn"
                    aria-expanded={isExpanded}
                    onClick={() =>
                      setExpandedTeams((prev) => ({
                        ...prev,
                        [team.team_id]: !prev[team.team_id],
                      }))
                    }
                  >
                    {isExpanded ? "Thu gọn" : "Mở rộng (repo, tóm tắt, tiêu chí…)"}
                  </button>
                  {onOpenTeam ? (
                    <button
                      type="button"
                      className="team-group-card__detail-btn"
                      onClick={() => onOpenTeam(team.team_id)}
                    >
                      Chi tiết đội →
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
        {!loading && grouped.length === 0 && <p className="state">Không có đội phù hợp tìm kiếm.</p>}
      </div>

      {!loading && grouped.length > 0 && (
        <PaginationBar
          page={teamsPage}
          pageCount={teamsPageCount}
          totalItems={grouped.length}
          pageSize={TEAMS_PAGE_SIZE}
          onPageChange={setTeamsPage}
          ariaLabel="Phân trang bảng đội (cuối)"
        />
      )}
    </>
  );
}

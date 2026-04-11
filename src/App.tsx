import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { computePageCount, PaginationBar, slicePage } from "./components/Pagination";
import { TeamDetail } from "./components/TeamDetail";
import { TeamsTable } from "./components/TeamsTable";
import { MetaChips, Skeleton } from "./components/Presentation";
import { GLOBAL_FEED_QUERY_LIMIT, useReviewsData } from "./hooks/useReviewsData";
import {
  extractBatchReviewMeta,
  fallbackSummary,
  formatBatchReviewDisplayValue,
  formatBatchedShaPreview,
  formatStatusLabel,
  shouldShowReviewStatusBadge,
  shortSha,
  toAbsoluteTime,
  toRelativeTime,
  type ReviewItem,
} from "./types/reviews";

const TIMELINE_PAGE_SIZE = 12;

export default function App() {
  const [query, setQuery] = useState("");
  const [timelinePage, setTimelinePage] = useState(1);
  const {
    globalFeed,
    latestTeams,
    teamFeed,
    selectedTeam,
    setSelectedTeam,
    loadingGlobal,
    loadingLatest,
    loadingTeam,
    stats,
  } = useReviewsData();
  const navigate = useNavigate();

  const openTeamDetail = (teamId: string) => {
    setSelectedTeam(teamId);
    navigate(`/teams/${encodeURIComponent(teamId)}`);
  };

  const filteredGlobal = useMemo(() => {
    const q = query.toLowerCase();
    return globalFeed.filter((item) => {
      const text = `${item.team_id} ${item.repo_name || ""} ${item.push_summary || ""} ${item.commit_sha || ""}`.toLowerCase();
      return text.includes(q);
    });
  }, [globalFeed, query]);

  const timelinePageCount = useMemo(
    () => computePageCount(filteredGlobal.length, TIMELINE_PAGE_SIZE),
    [filteredGlobal.length]
  );

  const paginatedTimeline = useMemo(
    () => slicePage(filteredGlobal, timelinePage, TIMELINE_PAGE_SIZE),
    [filteredGlobal, timelinePage]
  );

  useEffect(() => {
    setTimelinePage(1);
  }, [query]);

  useEffect(() => {
    if (timelinePage > timelinePageCount) setTimelinePage(timelinePageCount);
  }, [timelinePage, timelinePageCount]);

  const teamOptions = useMemo(() => {
    return latestTeams.map((item) => ({
      teamId: item.team_id,
      repoName: item.repo_name || item.team_id,
    }));
  }, [latestTeams]);

  const timelineFilterStats = useMemo(() => {
    const teamFiltered = new Set(filteredGlobal.map((r) => r.team_id));
    const teamPage = new Set(paginatedTimeline.map((r) => r.team_id));
    return {
      totalPushes: filteredGlobal.length,
      uniqueTeams: teamFiltered.size,
      itemsOnPage: paginatedTimeline.length,
      uniqueTeamsOnPage: teamPage.size,
    };
  }, [filteredGlobal, paginatedTimeline]);

  return (
    <div className="page">
      <header className="topbar">
        <div className="brand-block">
          <h1>Hackathon Review</h1>
        </div>
        <nav className="nav">
          <NavLink to="/teams" className={({ isActive }) => (isActive ? "active" : undefined)}>
            Đội thi
          </NavLink>
          <NavLink to="/" className={({ isActive }) => (isActive ? "active" : undefined)} end>
            Timeline
          </NavLink>
        </nav>
      </header>

      <Routes>
        <Route
          path="/"
          element={
            <>
              <section className="kpi-grid">
                <KpiCard label="Lỗi" value={stats.error} />
                <KpiCard label="Đang chạy" value={stats.running} />
                <KpiCard
                  label="Cập nhật gần nhất"
                  value={stats.latest ? `${toRelativeTime(stats.latest)} · ${toAbsoluteTime(stats.latest)}` : "—"}
                />
                <KpiCard
                  label="Bản ghi commit (đang tải)"
                  value={globalFeed.length}
                  hint={
                    globalFeed.length >= GLOBAL_FEED_QUERY_LIMIT
                      ? `Tối đa ${GLOBAL_FEED_QUERY_LIMIT} bản ghi mỗi lần tải — có thể còn nhiều hơn trong DB.`
                      : `Tối đa ${GLOBAL_FEED_QUERY_LIMIT} bản ghi mỗi lần tải.`
                  }
                />
              </section>

              <div className="controls">
                <input
                  placeholder="Tìm team, repo, commit, tóm tắt…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label="Tìm kiếm"
                />
              </div>

              <main className="layout">
                <section className="panel timeline page-section">
                  <div className="page-section-head">
                    <h2 className="panel-title page-section-title">Lịch sử review (toàn cục)</h2>
                    <p className="page-section-desc">Nhấp một dòng để mở chi tiết đội.</p>
                  </div>
                  {loadingGlobal && (
                    <div className="timeline-shell">
                      <div className="timeline-scroll">
                        <TimelineSkeleton />
                      </div>
                    </div>
                  )}
                  {!loadingGlobal && filteredGlobal.length === 0 && (
                    <p className="state">Không có sự kiện phù hợp tìm kiếm.</p>
                  )}
                  {!loadingGlobal && filteredGlobal.length > 0 && (
                    <div className="timeline-shell">
                      <TimelineLayoutMeta
                        totalPushes={timelineFilterStats.totalPushes}
                        uniqueTeams={timelineFilterStats.uniqueTeams}
                        itemsOnPage={timelineFilterStats.itemsOnPage}
                        uniqueTeamsOnPage={timelineFilterStats.uniqueTeamsOnPage}
                        pageSize={TIMELINE_PAGE_SIZE}
                        loadedCap={GLOBAL_FEED_QUERY_LIMIT}
                        atLoadedCap={globalFeed.length >= GLOBAL_FEED_QUERY_LIMIT}
                      />
                      <PaginationBar
                        className="timeline-pagination timeline-pagination--top"
                        page={timelinePage}
                        pageCount={timelinePageCount}
                        totalItems={filteredGlobal.length}
                        pageSize={TIMELINE_PAGE_SIZE}
                        onPageChange={setTimelinePage}
                        ariaLabel="Phân trang lịch sử review (trên)"
                      />
                      <div className="timeline-scroll">
                        <div className="timeline-page-items">
                          {paginatedTimeline.map((item) => (
                            <TimelineItem
                              key={`${item.team_id}-${item.commit_sha}-${item.updated_at}`}
                              item={item}
                              onOpenTeam={openTeamDetail}
                            />
                          ))}
                        </div>
                      </div>
                      <PaginationBar
                        className="timeline-pagination timeline-pagination--bottom"
                        page={timelinePage}
                        pageCount={timelinePageCount}
                        totalItems={filteredGlobal.length}
                        pageSize={TIMELINE_PAGE_SIZE}
                        onPageChange={setTimelinePage}
                        ariaLabel="Phân trang lịch sử review (dưới)"
                      />
                    </div>
                  )}
                </section>

                <TeamDetail
                  teamId={selectedTeam}
                  teams={teamOptions}
                  onTeamChange={setSelectedTeam}
                  onOpenTeam={openTeamDetail}
                  rows={teamFeed}
                  loading={loadingTeam}
                />
              </main>
            </>
          }
        />
        <Route
          path="/teams"
          element={
            <section className="panel page-panel">
              <div className="team-header">
                <h2 className="panel-title">Bảng đội</h2>
                <select
                  value={
                    teamOptions.some((t) => t.teamId === selectedTeam)
                      ? selectedTeam
                      : teamOptions[0]?.teamId ?? ""
                  }
                  onChange={(e) => openTeamDetail(e.target.value)}
                  disabled={!teamOptions.length}
                  aria-label="Chọn đội để xem commit và chi tiết"
                >
                  {!teamOptions.length ? (
                    <option value="">Đang tải danh sách đội…</option>
                  ) : (
                    teamOptions.map((team) => (
                      <option key={team.teamId} value={team.teamId}>
                        {team.repoName ? `${team.teamId} · ${team.repoName}` : team.teamId}
                      </option>
                    ))
                  )}
                </select>
              </div>
              <TeamsTable
                rows={latestTeams}
                commits={globalFeed}
                onOpenTeam={openTeamDetail}
                loading={loadingLatest || loadingGlobal}
              />
            </section>
          }
        />
        <Route
          path="/teams/:teamId"
          element={
            <TeamCommitPage
              selectedTeam={selectedTeam}
              setSelectedTeam={setSelectedTeam}
              teamFeed={teamFeed}
              teamOptions={teamOptions}
              loadingTeam={loadingTeam}
              onOpenTeam={openTeamDetail}
            />
          }
        />
      </Routes>
    </div>
  );
}

function TimelineLayoutMeta({
  totalPushes,
  uniqueTeams,
  itemsOnPage,
  uniqueTeamsOnPage,
  pageSize,
  loadedCap,
  atLoadedCap,
}: {
  totalPushes: number;
  uniqueTeams: number;
  itemsOnPage: number;
  uniqueTeamsOnPage: number;
  pageSize: number;
  loadedCap: number;
  atLoadedCap: boolean;
}) {
  return (
    <div className="timeline-layout-meta" role="status" aria-label="Thống kê timeline">
      <p className="timeline-layout-meta__compact">
        Sau tìm kiếm: <strong>{totalPushes}</strong> push · <strong>{uniqueTeams}</strong> đội · trang này:{" "}
        <strong>{itemsOnPage}</strong> push · <strong>{uniqueTeamsOnPage}</strong> đội · tối đa{" "}
        <strong>{pageSize}</strong> push/trang
        {atLoadedCap ? (
          <>
            {" "}
            · <span className="timeline-layout-meta__warn">đang giới hạn {loadedCap} bản ghi tải từ DB</span>
          </>
        ) : null}
      </p>
    </div>
  );
}

function TimelineSkeleton() {
  return (
    <div className="timeline-skeleton" aria-busy="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="timeline-item" style={{ borderLeftColor: "#e2e8f0" }}>
          <div className="line">
            <Skeleton className="skeleton-line" style={{ width: "40%" }} />
            <Skeleton className="skeleton-line" style={{ width: 72, height: 24 }} />
          </div>
          <Skeleton className="skeleton-line short" style={{ marginTop: 12 }} />
          <Skeleton className="skeleton-line" />
        </div>
      ))}
    </div>
  );
}

function TimelineItem({ item, onOpenTeam }: { item: ReviewItem; onOpenTeam?: (teamId: string) => void }) {
  const batchMeta = extractBatchReviewMeta(item.structured_output);
  const batchValue = formatBatchReviewDisplayValue(batchMeta);
  const batchShaPreview = formatBatchedShaPreview(batchMeta.batchedCommitShas);
  const chipItems: Array<{ label: string; value: string }> = [
    { label: "Repo", value: item.repo_name || "—" },
    { label: "Commit", value: shortSha(item.commit_sha) },
    { label: "Cập nhật", value: `${toRelativeTime(item.updated_at)} · ${toAbsoluteTime(item.updated_at)}` },
  ];
  if (batchValue) chipItems.push({ label: "Đợt review", value: batchValue });
  if (batchShaPreview) chipItems.push({ label: "SHA trong đợt", value: batchShaPreview });

  return (
    <article
      className={`timeline-item ${onOpenTeam ? "clickable" : ""}`}
      data-status={item.status}
      onClick={onOpenTeam ? () => onOpenTeam(item.team_id) : undefined}
      role={onOpenTeam ? "button" : undefined}
      tabIndex={onOpenTeam ? 0 : undefined}
      aria-label={onOpenTeam ? `Đội ${item.team_id}: nhấp để mở trang chi tiết` : undefined}
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
        {shouldShowReviewStatusBadge(item.status) ? <StatusBadge status={item.status} /> : null}
      </div>
      <MetaChips items={chipItems} />
      <p className="summary-text">{item.push_summary || fallbackSummary(item.status)}</p>
      {onOpenTeam ? (
        <div className="timeline-item-cta" aria-hidden>
          <span>Mở trang chi tiết đội</span>
          <span className="timeline-item-cta__arrow">→</span>
        </div>
      ) : null}
    </article>
  );
}

function KpiCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="kpi-card">
      <span>{label}</span>
      <strong>{value}</strong>
      {hint ? <p className="kpi-card__hint">{hint}</p> : null}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`badge ${status}`}>{formatStatusLabel(status)}</span>;
}

function TeamCommitPage({
  selectedTeam,
  setSelectedTeam,
  teamFeed,
  teamOptions,
  loadingTeam,
  onOpenTeam,
}: {
  selectedTeam: string;
  setSelectedTeam: (teamId: string) => void;
  teamFeed: ReviewItem[];
  teamOptions: Array<{ teamId: string; repoName: string }>;
  loadingTeam: boolean;
  onOpenTeam: (teamId: string) => void;
}) {
  const { teamId } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    if (teamId && teamId !== selectedTeam) {
      setSelectedTeam(teamId);
    }
  }, [teamId, selectedTeam, setSelectedTeam]);

  const handleTeamChange = (newTeamId: string) => {
    setSelectedTeam(newTeamId);
    navigate(`/teams/${encodeURIComponent(newTeamId)}`);
  };

  return (
    <section className="panel page-panel page-panel--detail">
      <nav className="back-nav" aria-label="Quay lại danh sách">
        <Link to="/teams" className="back-nav__link">
          <span className="back-nav__chevron" aria-hidden>
            ←
          </span>
          <span className="back-nav__copy">
            <span className="back-nav__title">Quay lại bảng đội</span>
          </span>
        </Link>
      </nav>
      <div className="panel-head panel-head--detail">
        <h2 className="panel-title">Chi tiết đội &amp; hệ thống</h2>
      </div>
      <TeamDetail
        teamId={selectedTeam}
        teams={teamOptions}
        onTeamChange={handleTeamChange}
        onOpenTeam={onOpenTeam}
        rows={teamFeed}
        loading={loadingTeam}
      />
    </section>
  );
}

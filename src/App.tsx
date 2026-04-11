import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { computePageCount, PaginationBar, slicePage } from "./components/Pagination";
import { TeamDetail } from "./components/TeamDetail";
import { TeamsTable } from "./components/TeamsTable";
import { MetaChips, Skeleton } from "./components/Presentation";
import { useReviewsData } from "./hooks/useReviewsData";
import {
  eventLabel,
  fallbackSummary,
  isPerPushReview,
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
    teamAggregate,
    selectedTeam,
    setSelectedTeam,
    loadingGlobal,
    loadingLatest,
    loadingTeam,
    loadingAggregate,
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
          <p className="sub">
            <strong>Dashboard giám khảo</strong> — theo dõi kết quả review AI theo từng push/commit. Luồng: đội push code →
            pipeline phân tích (AI) → lưu kết quả → hiển thị tại đây. Mỗi dòng trên Timeline là một bản ghi per-push đã xử lý;
            trang chi tiết đội có tổng quan lịch sử, từng push, danh mục công nghệ, nhận xét tiêu chí, test case và câu hỏi gợi ý
            — Hackathon RAG &amp; Agent.
          </p>
          <p className="pipeline-disclaimer">
            Lịch lấy commit và chạy review do pipeline cấu hình (ví dụ n8n: cron, webhook…); màn hình này chỉ đọc dữ liệu đã
            ghi nhận, không cấu hình hay kích hoạt pipeline.
          </p>
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
                <KpiCard label="Hoàn thành" value={stats.done} />
                <KpiCard label="Lỗi" value={stats.error} />
                <KpiCard label="Đang chạy" value={stats.running} />
                <KpiCard
                  label="Cập nhật gần nhất"
                  value={stats.latest ? `${toRelativeTime(stats.latest)} · ${toAbsoluteTime(stats.latest)}` : "—"}
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
                    <p className="page-section-desc">
                      Mỗi dòng là kết quả pipeline cho <strong>một push</strong> (bản ghi per-push). <strong>Nhấp một lần</strong>{" "}
                      vào dòng để mở <strong>trang chi tiết đội</strong> (cột bên phải trên Timeline, hoặc{" "}
                      <code>/teams/…</code>). Thanh bên dưới tiêu đề cho biết bố cục, số push/đội và phân trang; chỉ phần danh sách
                      là vùng cuộn.
                    </p>
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
                  aggregateReview={teamAggregate}
                  loading={loadingTeam}
                  loadingAggregate={loadingAggregate}
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
              <p className="sub page-hero" style={{ marginTop: 0 }}>
                <strong>Bảng đội cho giám khảo</strong> — dropdown phía trên để mở nhanh trang chi tiết đội (commit, R1, test case…).
                Hoặc <strong>nhấp một lần vào thẻ đội</strong> bên dưới. Phần <em>Các lần push đã nhận xét</em> trong thẻ chỉ mở/đóng
                danh sách — không chuyển trang.
              </p>
              <TeamsTable
                rows={latestTeams}
                commits={globalFeed.filter(isPerPushReview)}
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
              teamAggregate={teamAggregate}
              teamOptions={teamOptions}
              loadingTeam={loadingTeam}
              loadingAggregate={loadingAggregate}
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
}: {
  totalPushes: number;
  uniqueTeams: number;
  itemsOnPage: number;
  uniqueTeamsOnPage: number;
  pageSize: number;
}) {
  return (
    <div className="timeline-layout-meta" role="status" aria-label="Bố cục trang và thống kê timeline">
      <div className="timeline-layout-meta__layout">
        <span className="timeline-layout-meta__layout-label">Panel / cột</span>
        <p className="timeline-layout-meta__layout-text timeline-layout-meta__layout-text--wide">
          Đang xem dạng <strong>hai cột</strong> (màn rộng ≥ 1100px): cột trái là Timeline, cột phải là chi tiết đội.
        </p>
        <p className="timeline-layout-meta__layout-text timeline-layout-meta__layout-text--narrow">
          Đang xem dạng <strong>một cột</strong> (màn hẹp): Timeline trên, khối chi tiết đội xếp bên dưới.
        </p>
      </div>
      <ul className="timeline-layout-meta__stats">
        <li>
          Sau tìm kiếm: <strong>{totalPushes}</strong> push · <strong>{uniqueTeams}</strong> đội (không trùng)
        </li>
        <li>
          Trang hiện tại: <strong>{itemsOnPage}</strong> push · <strong>{uniqueTeamsOnPage}</strong> đội
        </li>
        <li>
          Kích thước trang: tối đa <strong>{pageSize}</strong> push — dùng phân trang trên/dưới danh sách
        </li>
      </ul>
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
        <StatusBadge status={item.status} />
      </div>
      <MetaChips
        items={[
          { label: "Repo", value: item.repo_name || "—" },
          { label: "Sự kiện", value: eventLabel(item.status) },
          { label: "Commit", value: shortSha(item.commit_sha) },
          { label: "Cập nhật", value: `${toRelativeTime(item.updated_at)} · ${toAbsoluteTime(item.updated_at)}` },
        ]}
      />
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

function KpiCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="kpi-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`badge ${status}`}>{status}</span>;
}

function TeamCommitPage({
  selectedTeam,
  setSelectedTeam,
  teamFeed,
  teamAggregate,
  teamOptions,
  loadingTeam,
  loadingAggregate,
  onOpenTeam,
}: {
  selectedTeam: string;
  setSelectedTeam: (teamId: string) => void;
  teamFeed: ReviewItem[];
  teamAggregate: ReviewItem | null;
  teamOptions: Array<{ teamId: string; repoName: string }>;
  loadingTeam: boolean;
  loadingAggregate: boolean;
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
            <span className="back-nav__subtitle">Xem tất cả đội · chọn đội khác</span>
          </span>
        </Link>
      </nav>
      <div className="panel-head panel-head--detail">
        <h2 className="panel-title">Chi tiết đội &amp; hệ thống</h2>
        <p className="panel-head-hint">Bạn đang xem một đội cụ thể. Dùng nút trên để về danh sách.</p>
      </div>
      <TeamDetail
        teamId={selectedTeam}
        teams={teamOptions}
        onTeamChange={handleTeamChange}
        onOpenTeam={onOpenTeam}
        rows={teamFeed}
        aggregateReview={teamAggregate}
        loading={loadingTeam}
        loadingAggregate={loadingAggregate}
      />
    </section>
  );
}

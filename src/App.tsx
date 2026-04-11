import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, Route, Routes, useNavigate, useParams } from "react-router-dom";
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

export default function App() {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
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
    return globalFeed.filter((item) => {
      const byStatus = statusFilter === "all" ? true : item.status === statusFilter;
      const text = `${item.team_id} ${item.repo_name || ""} ${item.push_summary || ""} ${item.commit_sha || ""}`.toLowerCase();
      const byQuery = text.includes(query.toLowerCase());
      return byStatus && byQuery;
    });
  }, [globalFeed, statusFilter, query]);

  const teamOptions = useMemo(() => {
    return latestTeams.map((item) => ({
      teamId: item.team_id,
      repoName: item.repo_name || item.team_id,
    }));
  }, [latestTeams]);

  return (
    <div className="page">
      <header className="topbar">
        <div className="brand-block">
          <h1>Hackathon Review</h1>
          <p className="sub">Theo dõi đội, mô tả hệ thống, tổng quan và review từng push — Hackathon RAG &amp; Agent</p>
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
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Lọc trạng thái">
                  <option value="all">Mọi trạng thái</option>
                  <option value="llm_started">AI đang xử lý</option>
                  <option value="done">Hoàn thành</option>
                  <option value="error">Lỗi</option>
                </select>
              </div>

              <main className="layout">
                <section className="panel timeline">
                  <h2 className="panel-title">Lịch sử review (toàn cục)</h2>
                  {loadingGlobal && <TimelineSkeleton />}
                  {!loadingGlobal && filteredGlobal.length === 0 && (
                    <p className="state">Không có sự kiện phù hợp bộ lọc.</p>
                  )}
                  {!loadingGlobal &&
                    filteredGlobal.map((item) => (
                      <TimelineItem
                        key={`${item.team_id}-${item.commit_sha}-${item.updated_at}`}
                        item={item}
                        onOpenTeam={openTeamDetail}
                      />
                    ))}
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
              <div className="panel-head">
                <h2 className="panel-title">Bảng đội</h2>
              </div>
              <p className="sub page-hero" style={{ marginTop: 0 }}>
                Mỗi thẻ là trạng thái mới nhất của một đội; mở rộng để xem mô tả hệ thống và từng lần push đã review.
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

  useEffect(() => {
    if (teamId && teamId !== selectedTeam) {
      setSelectedTeam(teamId);
    }
  }, [teamId, selectedTeam, setSelectedTeam]);

  return (
    <section className="panel page-panel">
      <Link to="/teams" className="back-link">
        ← Quay lại bảng đội
      </Link>
      <div className="panel-head">
        <h2 className="panel-title">Chi tiết đội &amp; hệ thống</h2>
      </div>
      <TeamDetail
        teamId={selectedTeam}
        teams={teamOptions}
        onTeamChange={setSelectedTeam}
        onOpenTeam={onOpenTeam}
        rows={teamFeed}
        aggregateReview={teamAggregate}
        loading={loadingTeam}
        loadingAggregate={loadingAggregate}
      />
    </section>
  );
}

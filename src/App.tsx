import { useMemo, useState } from "react";
import { Link, Route, Routes } from "react-router-dom";
import { TeamDetail } from "./components/TeamDetail";
import { TeamsTable } from "./components/TeamsTable";
import { useReviewsData } from "./hooks/useReviewsData";
import { eventLabel, fallbackSummary, shortSha, toAbsoluteTime, toRelativeTime, type ReviewItem } from "./types/reviews";

export default function App() {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
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
        <div>
          <h1>Hackathon Dashboard</h1>
          <p className="sub">Bảng theo dõi các đội tham gia và trạng thái review</p>
        </div>
        <nav className="nav">
          <Link to="/teams">Dashboard Teams</Link>
          <Link to="/">Timeline</Link>
        </nav>
      </header>

      <Routes>
        <Route
          path="/"
          element={
            <>
              <section className="kpi-grid">
                <KpiCard label="Done" value={stats.done} />
                <KpiCard label="Errors" value={stats.error} />
                <KpiCard label="In Progress" value={stats.running} />
                <KpiCard
                  label="Last Update"
                  value={stats.latest ? `${toRelativeTime(stats.latest)} (${toAbsoluteTime(stats.latest)})` : "N/A"}
                />
              </section>

              <div className="controls">
                <input
                  placeholder="Search team / commit / summary..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  <option value="all">All status</option>
                  <option value="llm_started">AI started</option>
                  <option value="done">Done</option>
                  <option value="error">Error</option>
                </select>
              </div>

              <main className="layout">
                <section className="panel timeline">
                  <h2>Global Timeline</h2>
                  {loadingGlobal && <p className="state">Loading global feed...</p>}
                  {!loadingGlobal && filteredGlobal.length === 0 && (
                    <p className="state">No events found for current filters.</p>
                  )}
                  {!loadingGlobal &&
                    filteredGlobal.map((item) => (
                      <TimelineItem key={`${item.team_id}-${item.commit_sha}-${item.updated_at}`} item={item} />
                    ))}
                </section>

                <TeamDetail
                  teamId={selectedTeam}
                  teams={teamOptions}
                  onTeamChange={setSelectedTeam}
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
            <section className="panel">
              <h2>Danh sach doi thi</h2>
              <TeamsTable rows={latestTeams} loading={loadingLatest} />
            </section>
          }
        />
      </Routes>
    </div>
  );
}

function TimelineItem({ item, showDetails = false }: { item: ReviewItem; showDetails?: boolean }) {
  return (
    <article className="timeline-item">
      <div className="line">
        <strong>{item.team_id}</strong>
        <StatusBadge status={item.status} />
      </div>
      <div className="meta">
        <span>Repo: {item.repo_name || "-"}</span>
        <span>{eventLabel(item.status)}</span>
        <span>Commit: {shortSha(item.commit_sha)}</span>
        <span title={toAbsoluteTime(item.updated_at)}>{toRelativeTime(item.updated_at)}</span>
      </div>
      <p>{item.push_summary || fallbackSummary(item.status)}</p>
      {showDetails && (
        <div className="details">
          <span>RAG: {item.rag_level || "-"}</span>
          <span>Input size: {item.input_code_length ?? 0}</span>
          <span>Updated: {toAbsoluteTime(item.updated_at)}</span>
        </div>
      )}
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

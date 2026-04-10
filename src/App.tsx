import { useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabase";

type ReviewItem = {
  team_id: string;
  repo_name: string | null;
  commit_sha: string | null;
  status: "llm_started" | "done" | "error" | string;
  push_summary: string | null;
  rag_level: string | null;
  structured_output: Record<string, unknown> | null;
  input_code_length: number | null;
  created_at: string;
  updated_at: string;
};

const TEAM_LIST = Array.from({ length: 27 }, (_, i) => `Team-${i + 1}`);
const GLOBAL_LIMIT = 100;
const TEAM_LIMIT = 50;

export default function App() {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedTeam, setSelectedTeam] = useState<string>("Team-1");
  const [globalFeed, setGlobalFeed] = useState<ReviewItem[]>([]);
  const [teamFeed, setTeamFeed] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [teamLoading, setTeamLoading] = useState(true);

  useEffect(() => {
    void refreshGlobalFeed(setGlobalFeed, setLoading);
    void refreshTeamFeed(selectedTeam, setTeamFeed, setTeamLoading);

    const channel = supabase
      .channel("timeline-ai-reviews")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ai_reviews" },
        () => {
          void refreshGlobalFeed(setGlobalFeed, setLoading);
          void refreshTeamFeed(selectedTeam, setTeamFeed, setTeamLoading);
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [selectedTeam]);

  const filteredGlobal = useMemo(() => {
    return globalFeed.filter((item) => {
      const byStatus = statusFilter === "all" ? true : item.status === statusFilter;
      const text = `${item.team_id} ${item.push_summary || ""} ${item.commit_sha || ""}`.toLowerCase();
      const byQuery = text.includes(query.toLowerCase());
      return byStatus && byQuery;
    });
  }, [globalFeed, statusFilter, query]);

  const stats = useMemo(() => {
    const done = globalFeed.filter((x) => x.status === "done").length;
    const error = globalFeed.filter((x) => x.status === "error").length;
    const running = globalFeed.filter((x) => x.status === "llm_started").length;
    const latest = globalFeed[0]?.updated_at || null;
    return { done, error, running, latest };
  }, [globalFeed]);

  return (
    <div className="page">
      <header className="topbar">
        <div>
          <h1>Hackathon Review Timeline</h1>
          <p className="sub">Realtime feed: team nào vừa push, AI xử lý ra sao</p>
        </div>
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
      </header>

      <section className="kpi-grid">
        <KpiCard label="Done" value={stats.done} />
        <KpiCard label="Errors" value={stats.error} />
        <KpiCard label="In Progress" value={stats.running} />
        <KpiCard
          label="Last Update"
          value={stats.latest ? `${toRelativeTime(stats.latest)} (${toAbsoluteTime(stats.latest)})` : "N/A"}
        />
      </section>

      <main className="layout">
        <section className="panel timeline">
          <h2>Global Timeline</h2>
          {loading && <p className="state">Loading global feed...</p>}
          {!loading && filteredGlobal.length === 0 && (
            <p className="state">No events found for current filters.</p>
          )}
          {!loading &&
            filteredGlobal.map((item) => (
              <TimelineItem key={`${item.team_id}-${item.commit_sha}-${item.updated_at}`} item={item} />
            ))}
        </section>

        <section className="panel team-panel">
          <div className="team-header">
            <h2>Team Timeline</h2>
            <select
              value={selectedTeam}
              onChange={(e) => setSelectedTeam(e.target.value)}
            >
              {TEAM_LIST.map((team) => (
                <option key={team} value={team}>
                  {team}
                </option>
              ))}
            </select>
          </div>
          {teamLoading && <p className="state">Loading team timeline...</p>}
          {!teamLoading && teamFeed.length === 0 && (
            <p className="state">Team này chưa có review events.</p>
          )}
          {!teamLoading &&
            teamFeed.map((item) => (
              <TimelineItem key={`${item.team_id}-${item.commit_sha}-${item.updated_at}`} item={item} showDetails />
            ))}
        </section>
      </main>
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

function shortSha(sha: string | null) {
  if (!sha) return "unknown";
  return sha.slice(0, 8);
}

function eventLabel(status: string) {
  if (status === "done") return "AI review completed";
  if (status === "llm_started") return "AI review started";
  if (status === "error") return "AI review failed";
  return "Review event";
}

function fallbackSummary(status: string) {
  if (status === "done") return "AI completed and stored the review output.";
  if (status === "llm_started") return "New push received. AI started analyzing this commit.";
  if (status === "error") return "AI encountered an issue while processing this commit.";
  return "No summary provided.";
}

function toAbsoluteTime(value: string) {
  return new Date(value).toLocaleString();
}

function toRelativeTime(value: string) {
  const now = Date.now();
  const then = new Date(value).getTime();
  const diffSec = Math.max(0, Math.floor((now - then) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

async function refreshGlobalFeed(
  setGlobalFeed: (rows: ReviewItem[]) => void,
  setLoading: (value: boolean) => void
) {
  setLoading(true);
  const { data, error } = await supabase
    .from("ai_reviews")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(GLOBAL_LIMIT);
  if (error) {
    console.error("Failed to load global timeline", error);
    setGlobalFeed([]);
    setLoading(false);
    return;
  }
  setGlobalFeed((data as ReviewItem[]) || []);
  setLoading(false);
}

async function refreshTeamFeed(
  teamId: string,
  setTeamFeed: (rows: ReviewItem[]) => void,
  setTeamLoading: (value: boolean) => void
) {
  setTeamLoading(true);
  const { data, error } = await supabase
    .from("ai_reviews")
    .select("*")
    .eq("team_id", teamId)
    .order("updated_at", { ascending: false })
    .limit(TEAM_LIMIT);
  if (error) {
    console.error("Failed to load team timeline", error);
    setTeamFeed([]);
    setTeamLoading(false);
    return;
  }
  setTeamFeed((data as ReviewItem[]) || []);
  setTeamLoading(false);
}

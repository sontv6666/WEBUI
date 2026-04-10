import { useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabase";

type TeamLatest = {
  team_id: string;
  repo_name: string | null;
  commit_sha: string | null;
  status: "llm_started" | "done" | "error" | string;
  push_summary: string | null;
  rag_level: string | null;
  updated_at: string;
};

type ReviewItem = TeamLatest & {
  structured_output: Record<string, unknown> | null;
  input_code_length: number | null;
  created_at: string;
};

const TEAM_LIST = Array.from({ length: 27 }, (_, i) => `Team-${i + 1}`);

export default function App() {
  const [rows, setRows] = useState<TeamLatest[]>([]);
  const [query, setQuery] = useState("");
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const [teamReviews, setTeamReviews] = useState<ReviewItem[]>([]);
  const [loadingTeam, setLoadingTeam] = useState(false);

  useEffect(() => {
    let active = true;

    const fetchLatest = async () => {
      const { data, error } = await supabase
        .from("team_latest_reviews")
        .select("*")
        .order("updated_at", { ascending: false });
      if (!active) return;
      if (error) {
        console.error("Failed to load latest reviews", error);
        return;
      }
      setRows((data as TeamLatest[]) || []);
    };

    fetchLatest();

    const channel = supabase
      .channel("ai-reviews-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ai_reviews" },
        () => {
          fetchLatest();
          if (selectedTeam) {
            void loadTeamHistory(selectedTeam, setTeamReviews, setLoadingTeam);
          }
        }
      )
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [selectedTeam]);

  const filtered = useMemo(() => {
    const byTeam = new Map(rows.map((row) => [row.team_id, row]));
    return TEAM_LIST.map((team) => byTeam.get(team))
      .filter(Boolean)
      .filter((item) =>
        item!.team_id.toLowerCase().includes(query.toLowerCase())
      ) as TeamLatest[];
  }, [rows, query]);

  return (
    <div className="page">
      <header className="topbar">
        <h1>Hackathon AI Review Dashboard</h1>
        <input
          placeholder="Search team..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </header>

      <main className="layout">
        <section className="panel list">
          <h2>27 Teams</h2>
          <div className="team-grid">
            {filtered.map((row) => (
              <button
                key={`${row.team_id}-${row.commit_sha}`}
                className={`team-card ${selectedTeam === row.team_id ? "active" : ""}`}
                onClick={() => {
                  setSelectedTeam(row.team_id);
                  void loadTeamHistory(
                    row.team_id,
                    setTeamReviews,
                    setLoadingTeam
                  );
                }}
              >
                <div className="line">
                  <strong>{row.team_id}</strong>
                  <StatusBadge status={row.status} />
                </div>
                <p>{row.push_summary || "No summary yet"}</p>
                <small>{new Date(row.updated_at).toLocaleString()}</small>
              </button>
            ))}
          </div>
        </section>

        <section className="panel details">
          <h2>{selectedTeam ? `Latest Reviews - ${selectedTeam}` : "Select a team"}</h2>
          {loadingTeam && <p>Loading reviews...</p>}
          {!loadingTeam && selectedTeam && teamReviews.length === 0 && (
            <p>No review history found.</p>
          )}
          {!loadingTeam &&
            teamReviews.map((item) => (
              <article className="review-card" key={`${item.team_id}-${item.commit_sha}`}>
                <div className="line">
                  <code>{item.commit_sha || "unknown-sha"}</code>
                  <StatusBadge status={item.status} />
                </div>
                <p>{item.push_summary || "No summary available"}</p>
                <div className="meta">
                  <span>RAG: {item.rag_level || "-"}</span>
                  <span>Input len: {item.input_code_length ?? 0}</span>
                  <span>{new Date(item.updated_at).toLocaleString()}</span>
                </div>
              </article>
            ))}
        </section>
      </main>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`badge ${status}`}>{status}</span>;
}

async function loadTeamHistory(
  teamId: string,
  setTeamReviews: (rows: ReviewItem[]) => void,
  setLoadingTeam: (value: boolean) => void
) {
  setLoadingTeam(true);
  const { data, error } = await supabase
    .from("ai_reviews")
    .select("*")
    .eq("team_id", teamId)
    .order("updated_at", { ascending: false })
    .limit(20);
  if (error) {
    console.error("Failed to load team reviews", error);
    setTeamReviews([]);
    setLoadingTeam(false);
    return;
  }
  setTeamReviews((data as ReviewItem[]) || []);
  setLoadingTeam(false);
}

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import type { ReviewItem, TeamLatestReview } from "../types/reviews";

const GLOBAL_LIMIT = 1000;
const TEAM_LIMIT = 50;

export function useReviewsData() {
  const [globalFeed, setGlobalFeed] = useState<ReviewItem[]>([]);
  const [latestTeams, setLatestTeams] = useState<TeamLatestReview[]>([]);
  const [selectedTeam, setSelectedTeam] = useState("");
  const [teamFeed, setTeamFeed] = useState<ReviewItem[]>([]);
  const [teamAggregate, setTeamAggregate] = useState<ReviewItem | null>(null);
  const [loadingGlobal, setLoadingGlobal] = useState(true);
  const [loadingLatest, setLoadingLatest] = useState(true);
  const [loadingTeam, setLoadingTeam] = useState(false);
  const [loadingAggregate, setLoadingAggregate] = useState(false);

  const refreshGlobal = useCallback(async () => {
    setLoadingGlobal(true);
    const { data, error } = await supabase
      .from("ai_reviews")
      .select("*")
      .eq("review_kind", "per_push")
      .order("updated_at", { ascending: false })
      .limit(GLOBAL_LIMIT);
    if (error) {
      console.error("Failed to load global timeline", error);
      setGlobalFeed([]);
      setLoadingGlobal(false);
      return;
    }
    setGlobalFeed((data as ReviewItem[]) || []);
    setLoadingGlobal(false);
  }, []);

  const refreshLatest = useCallback(async () => {
    setLoadingLatest(true);
    const { data, error } = await supabase
      .from("team_latest_reviews")
      .select("*")
      .order("updated_at", { ascending: false });
    if (error) {
      console.error("Failed to load latest team reviews", error);
      setLatestTeams([]);
      setLoadingLatest(false);
      return;
    }
    setLatestTeams((data as TeamLatestReview[]) || []);
    setLoadingLatest(false);
  }, []);

  const refreshTeamHistory = useCallback(async (teamId: string) => {
    if (!teamId) {
      setTeamFeed([]);
      setLoadingTeam(false);
      return;
    }
    setLoadingTeam(true);
    const { data, error } = await supabase
      .from("ai_reviews")
      .select("*")
      .eq("team_id", teamId)
      .eq("review_kind", "per_push")
      .order("updated_at", { ascending: false })
      .limit(TEAM_LIMIT);
    if (error) {
      console.error("Failed to load team timeline", error);
      setTeamFeed([]);
      setLoadingTeam(false);
      return;
    }
    setTeamFeed((data as ReviewItem[]) || []);
    setLoadingTeam(false);
  }, []);

  const refreshTeamAggregate = useCallback(async (teamId: string) => {
    if (!teamId) {
      setTeamAggregate(null);
      setLoadingAggregate(false);
      return;
    }
    setLoadingAggregate(true);
    const { data, error } = await supabase
      .from("ai_reviews")
      .select("*")
      .eq("team_id", teamId)
      .eq("review_kind", "team_aggregate")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      console.error("Failed to load team aggregate review", error);
      setTeamAggregate(null);
      setLoadingAggregate(false);
      return;
    }
    setTeamAggregate((data as ReviewItem) || null);
    setLoadingAggregate(false);
  }, []);

  useEffect(() => {
    void Promise.all([refreshGlobal(), refreshLatest()]);
  }, [refreshGlobal, refreshLatest]);

  useEffect(() => {
    if (!selectedTeam) return;
    void refreshTeamHistory(selectedTeam);
    void refreshTeamAggregate(selectedTeam);
  }, [selectedTeam, refreshTeamHistory, refreshTeamAggregate]);

  useEffect(() => {
    if (latestTeams.length === 0) {
      setSelectedTeam("");
      return;
    }
    if (!selectedTeam || !latestTeams.some((x) => x.team_id === selectedTeam)) {
      setSelectedTeam(latestTeams[0].team_id);
    }
  }, [latestTeams, selectedTeam]);

  useEffect(() => {
    const channel = supabase
      .channel("judge-dashboard-reviews")
      .on("postgres_changes", { event: "*", schema: "public", table: "ai_reviews" }, (payload) => {
        void refreshGlobal();
        void refreshLatest();
        const changedTeam =
          (payload.new as { team_id?: string } | null)?.team_id ||
          (payload.old as { team_id?: string } | null)?.team_id;
        if (selectedTeam && changedTeam && changedTeam === selectedTeam) {
          void refreshTeamHistory(selectedTeam);
          void refreshTeamAggregate(selectedTeam);
        }
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refreshGlobal, refreshLatest, refreshTeamHistory, refreshTeamAggregate, selectedTeam]);

  // Fallback polling in case realtime socket is temporarily disrupted.
  useEffect(() => {
    const timer = window.setInterval(() => {
      void refreshGlobal();
      void refreshLatest();
      if (selectedTeam) {
        void refreshTeamHistory(selectedTeam);
        void refreshTeamAggregate(selectedTeam);
      }
    }, 60000);

    return () => {
      window.clearInterval(timer);
    };
  }, [refreshGlobal, refreshLatest, refreshTeamHistory, refreshTeamAggregate, selectedTeam]);

  const stats = useMemo(() => {
    const done = latestTeams.filter((x) => x.status === "done").length;
    const error = latestTeams.filter((x) => x.status === "error").length;
    const running = latestTeams.filter((x) => x.status === "llm_started").length;
    const latest = latestTeams[0]?.updated_at || null;
    return { done, error, running, latest };
  }, [latestTeams]);

  return {
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
  };
}


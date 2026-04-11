import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import type { ReviewItem, TeamLatestReview } from "../types/reviews";

/** Giới hạn số hàng `ai_reviews` tải cho timeline toàn cục (Supabase `.limit`). */
export const GLOBAL_FEED_QUERY_LIMIT = 1000;
const GLOBAL_LIMIT = GLOBAL_FEED_QUERY_LIMIT;
const TEAM_LIMIT = 50;

/** Gộp burst realtime (llm_started → done) để tránh nhiều request liên tiếp. */
const REALTIME_DEBOUNCE_MS = 650;

export type RefreshOptions = {
  /** true: không bật loading skeleton (dùng cho realtime + polling nền). */
  silent?: boolean;
};

export function useReviewsData() {
  const [globalFeed, setGlobalFeed] = useState<ReviewItem[]>([]);
  const [latestTeams, setLatestTeams] = useState<TeamLatestReview[]>([]);
  const [selectedTeam, setSelectedTeam] = useState("");
  const [teamFeed, setTeamFeed] = useState<ReviewItem[]>([]);
  const [loadingGlobal, setLoadingGlobal] = useState(true);
  const [loadingLatest, setLoadingLatest] = useState(true);
  const [loadingTeam, setLoadingTeam] = useState(false);

  const selectedTeamRef = useRef(selectedTeam);
  selectedTeamRef.current = selectedTeam;

  const refreshGlobal = useCallback(async (opts?: RefreshOptions) => {
    const silent = opts?.silent === true;
    if (!silent) setLoadingGlobal(true);
    const { data, error } = await supabase
      .from("ai_reviews")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(GLOBAL_LIMIT);
    if (error) {
      console.error("Failed to load global timeline", error);
      setGlobalFeed([]);
      if (!silent) setLoadingGlobal(false);
      return;
    }
    setGlobalFeed((data as ReviewItem[]) || []);
    if (!silent) setLoadingGlobal(false);
  }, []);

  const refreshLatest = useCallback(async (opts?: RefreshOptions) => {
    const silent = opts?.silent === true;
    if (!silent) setLoadingLatest(true);
    const { data, error } = await supabase
      .from("team_latest_reviews")
      .select("*")
      .order("updated_at", { ascending: false });
    if (error) {
      console.error("Failed to load latest team reviews", error);
      setLatestTeams([]);
      if (!silent) setLoadingLatest(false);
      return;
    }
    setLatestTeams((data as TeamLatestReview[]) || []);
    if (!silent) setLoadingLatest(false);
  }, []);

  const refreshTeamHistory = useCallback(async (teamId: string, opts?: RefreshOptions) => {
    const silent = opts?.silent === true;
    if (!teamId) {
      setTeamFeed([]);
      if (!silent) setLoadingTeam(false);
      return;
    }
    if (!silent) setLoadingTeam(true);
    const { data, error } = await supabase
      .from("ai_reviews")
      .select("*")
      .eq("team_id", teamId)
      .order("updated_at", { ascending: false })
      .limit(TEAM_LIMIT);
    if (error) {
      console.error("Failed to load team timeline", error);
      setTeamFeed([]);
      if (!silent) setLoadingTeam(false);
      return;
    }
    setTeamFeed((data as ReviewItem[]) || []);
    if (!silent) setLoadingTeam(false);
  }, []);

  useEffect(() => {
    void Promise.all([refreshGlobal(), refreshLatest()]);
  }, [refreshGlobal, refreshLatest]);

  useEffect(() => {
    if (!selectedTeam) return;
    void refreshTeamHistory(selectedTeam);
  }, [selectedTeam, refreshTeamHistory]);

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
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;

    const runSilentRefresh = () => {
      void refreshGlobal({ silent: true });
      void refreshLatest({ silent: true });
      const st = selectedTeamRef.current;
      if (st) void refreshTeamHistory(st, { silent: true });
    };

    const channel = supabase
      .channel("judge-dashboard-reviews")
      .on("postgres_changes", { event: "*", schema: "public", table: "ai_reviews" }, () => {
        window.clearTimeout(debounceTimer);
        debounceTimer = window.setTimeout(runSilentRefresh, REALTIME_DEBOUNCE_MS);
      })
      .subscribe();

    return () => {
      window.clearTimeout(debounceTimer);
      void supabase.removeChannel(channel);
    };
  }, [refreshGlobal, refreshLatest, refreshTeamHistory]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void refreshGlobal({ silent: true });
      void refreshLatest({ silent: true });
      const st = selectedTeamRef.current;
      if (st) void refreshTeamHistory(st, { silent: true });
    }, 60000);

    return () => {
      window.clearInterval(timer);
    };
  }, [refreshGlobal, refreshLatest, refreshTeamHistory]);

  const stats = useMemo(() => {
    const error = latestTeams.filter((x) => x.status === "error").length;
    const running = latestTeams.filter((x) => x.status === "llm_started").length;
    const latest = latestTeams[0]?.updated_at || null;
    return { error, running, latest };
  }, [latestTeams]);

  return {
    globalFeed,
    latestTeams,
    teamFeed,
    selectedTeam,
    setSelectedTeam,
    loadingGlobal,
    loadingLatest,
    loadingTeam,
    stats,
  };
}

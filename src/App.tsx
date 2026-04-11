import { type CSSProperties, useEffect, useMemo, useState } from "react";
import { Link, NavLink, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { computePageCount, PaginationBar, slicePage } from "./components/Pagination";
import { getTeamDetailNavEntries, TeamDetail, type TeamDetailNavEntry } from "./components/TeamDetail";
import { AllTeamsGrid } from "./components/AllTeamsGrid";
import { TeamsTable } from "./components/TeamsTable";
import { MetaChips, Skeleton } from "./components/Presentation";
import { GLOBAL_FEED_QUERY_LIMIT, useReviewsData } from "./hooks/useReviewsData";
import {
  extractBatchReviewMeta,
  fallbackSummary,
  formatBatchReviewDisplayValue,
  formatBatchedShaPreview,
  reviewKindOf,
  shortSha,
  toAbsoluteTime,
  toRelativeTime,
  type ReviewItem,
} from "./types/reviews";

const TIMELINE_PAGE_SIZE = 12;

const TEAM_PICKER_COLS_KEY = "hackathon-team-picker-cols";

export default function App() {
  const [searchInput, setSearchInput] = useState("");
  /** Bộ lọc timeline — áp khi bấm Tìm hoặc Enter */
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

  const [teamGridColumns, setTeamGridColumns] = useState<2 | 3 | 5>(() => {
    try {
      const v = localStorage.getItem(TEAM_PICKER_COLS_KEY);
      if (v === "2" || v === "3" || v === "5") return Number(v) as 2 | 3 | 5;
    } catch {
      /* ignore */
    }
    return 3;
  });

  const setTeamGridColumnsPersist = (n: 2 | 3 | 5) => {
    setTeamGridColumns(n);
    try {
      localStorage.setItem(TEAM_PICKER_COLS_KEY, String(n));
    } catch {
      /* ignore */
    }
  };

  const openTeamDetail = (teamId: string) => {
    setSelectedTeam(teamId);
    navigate(`/teams/${encodeURIComponent(teamId)}`);
  };

  const perPushCountByTeam = useMemo(() => {
    const m = new Map<string, number>();
    for (const item of globalFeed) {
      if (reviewKindOf(item) !== "per_push") continue;
      const id = item.team_id;
      m.set(id, (m.get(id) ?? 0) + 1);
    }
    return m;
  }, [globalFeed]);

  const timelineKpis = useMemo(() => {
    const teamIds = new Set(globalFeed.map((r) => r.team_id));
    let perPushTotal = 0;
    for (const item of globalFeed) {
      if (reviewKindOf(item) === "per_push") perPushTotal += 1;
    }
    return { uniqueTeams: teamIds.size, perPushTotal };
  }, [globalFeed]);

  const filteredGlobal = useMemo(() => {
    const q = query.toLowerCase();
    const filtered = globalFeed.filter((item) => {
      const text = `${item.team_id} ${item.repo_name || ""} ${item.push_summary || ""} ${item.commit_sha || ""}`.toLowerCase();
      return text.includes(q);
    });
    const pushRank = (teamId: string) => perPushCountByTeam.get(teamId) ?? 0;
    return [...filtered].sort((a, b) => {
      const ra = pushRank(a.team_id);
      const rb = pushRank(b.team_id);
      if (rb !== ra) return rb - ra;
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
  }, [globalFeed, query, perPushCountByTeam]);

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
          <NavLink to="/teams" end className={({ isActive }) => (isActive ? "active" : undefined)}>
            Đội thi
          </NavLink>
          <NavLink to="/teams/all" className={({ isActive }) => (isActive ? "active" : undefined)}>
            Tất cả đội
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
              <section className="kpi-grid kpi-grid--timeline">
                <KpiCard label="Số đội (trong phạm vi tải)" value={timelineKpis.uniqueTeams} />
                <KpiCard
                  label="Push per-push (đã tải)"
                  value={timelineKpis.perPushTotal}
                  hint={`Đếm bản ghi per_push trong tối đa ${GLOBAL_FEED_QUERY_LIMIT} dòng mới nhất.`}
                />
                <KpiCard
                  label="Cập nhật gần nhất (đội)"
                  value={stats.latest ? `${toRelativeTime(stats.latest)} · ${toAbsoluteTime(stats.latest)}` : "—"}
                />
                <KpiCard
                  label="Bản ghi đã tải"
                  value={globalFeed.length}
                  hint={
                    globalFeed.length >= GLOBAL_FEED_QUERY_LIMIT
                      ? `Tối đa ${GLOBAL_FEED_QUERY_LIMIT} bản ghi mỗi lần — có thể còn nhiều hơn trong DB.`
                      : `Tối đa ${GLOBAL_FEED_QUERY_LIMIT} bản ghi mỗi lần tải.`
                  }
                />
              </section>

              <form
                className="controls controls--search"
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
                  aria-label="Tìm kiếm"
                  autoComplete="off"
                />
                <button type="submit" className="controls-search-btn">
                  Tìm
                </button>
              </form>

              <main className="layout">
                <section className="panel timeline page-section timeline-page-section">
                  <div className="page-section-head page-section-head--compact">
                    <h2 className="panel-title page-section-title">Lịch sử review</h2>
                    <p className="page-section-desc page-section-desc--inline">
                      Ưu tiên đội nhiều push · nhấp dòng để mở chi tiết.
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
                        loadedCap={GLOBAL_FEED_QUERY_LIMIT}
                        atLoadedCap={globalFeed.length >= GLOBAL_FEED_QUERY_LIMIT}
                        sortHint="Đội nhiều push xếp trước, sau đó mới nhất trước."
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
                  rows={teamFeed}
                  loading={loadingTeam}
                  homeSidebar
                />
              </main>
            </>
          }
        />
        <Route
          path="/teams/all"
          element={
            <section className="panel page-panel">
              <div className="team-header team-header--with-link">
                <div className="team-header__titles">
                  <h2 className="panel-title">Tất cả đội</h2>
                  <p className="team-panel-subtitle">
                    Lưới gọn theo từng đội; mở rộng chi tiết hoặc vào trang commit.
                  </p>
                </div>
                <Link className="link-button" to="/teams">
                  ← Bảng đội
                </Link>
              </div>
              <AllTeamsGrid
                latestRows={latestTeams}
                commits={globalFeed}
                loading={loadingLatest || loadingGlobal}
              />
            </section>
          }
        />
        <Route
          path="/teams"
          element={
            <section className="panel page-panel">
              <div className="team-header team-header--with-link">
                <div className="team-header__row">
                  <h2 className="panel-title">Bảng đội</h2>
                  <Link className="link-button link-button--accent" to="/teams/all">
                    Tất cả đội (lưới) →
                  </Link>
                </div>
                <div className="team-picker-toolbar" role="group" aria-label="Chọn đội và mật độ lưới">
                  <div className="team-picker-density" role="group" aria-label="Số đội mỗi hàng">
                    <span className="team-picker-density__label">Hàng:</span>
                    {([2, 3, 5] as const).map((n) => (
                      <button
                        key={n}
                        type="button"
                        className={`team-picker-density__btn${teamGridColumns === n ? " team-picker-density__btn--active" : ""}`}
                        onClick={() => setTeamGridColumnsPersist(n)}
                        aria-pressed={teamGridColumns === n}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
                <div
                  className="team-picker-grid"
                  style={{ "--team-cols": String(teamGridColumns) } as CSSProperties}
                >
                  {!teamOptions.length ? (
                    <p className="state team-picker-grid__empty">Đang tải danh sách đội…</p>
                  ) : (
                    teamOptions.map((team) => {
                      const current = selectedTeam === team.teamId;
                      return (
                        <button
                          key={team.teamId}
                          type="button"
                          className={`team-picker-tile${current ? " team-picker-tile--current" : ""}`}
                          onClick={() => openTeamDetail(team.teamId)}
                        >
                          <span className="team-picker-tile__id">{team.teamId}</span>
                          {team.repoName ? (
                            <span className="team-picker-tile__repo" title={team.repoName}>
                              {team.repoName}
                            </span>
                          ) : null}
                        </button>
                      );
                    })
                  )}
                </div>
                <details className="team-picker-quick-select">
                  <summary>Chọn nhanh (danh sách)</summary>
                  <select
                    className="team-picker-quick-select__select"
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
                </details>
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
  sortHint,
}: {
  totalPushes: number;
  uniqueTeams: number;
  itemsOnPage: number;
  uniqueTeamsOnPage: number;
  pageSize: number;
  loadedCap: number;
  atLoadedCap: boolean;
  sortHint: string;
}) {
  return (
    <div className="timeline-layout-meta" role="status" aria-label="Thống kê timeline">
      <p className="timeline-layout-meta__compact">
        <strong>{totalPushes}</strong> dòng · <strong>{uniqueTeams}</strong> đội
        {atLoadedCap ? (
          <>
            {" "}
            · <span className="timeline-layout-meta__warn">tối đa {loadedCap} bản ghi</span>
          </>
        ) : null}
        <span className="timeline-layout-meta__sep"> · </span>
        Trang: <strong>{itemsOnPage}</strong>/<strong>{pageSize}</strong> · <strong>{uniqueTeamsOnPage}</strong> đội
      </p>
      <p className="timeline-layout-meta__sort">{sortHint}</p>
    </div>
  );
}

function TimelineSkeleton() {
  return (
    <div className="timeline-skeleton" aria-busy="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="timeline-item timeline-item--feed" style={{ borderLeftColor: "#e2e8f0" }}>
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
    { label: "Cập nhật", value: toRelativeTime(item.updated_at) },
  ];
  if (batchValue) chipItems.push({ label: "Đợt review", value: batchValue });
  if (batchShaPreview) chipItems.push({ label: "SHA trong đợt", value: batchShaPreview });

  return (
    <article
      className={`timeline-item timeline-item--feed ${onOpenTeam ? "clickable" : ""}`}
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

  const navEntries = useMemo(() => getTeamDetailNavEntries(teamFeed), [teamFeed]);
  const navLinkEntries = useMemo(
    () => navEntries.filter((e): e is Extract<TeamDetailNavEntry, { kind: "link" }> => e.kind === "link"),
    [navEntries]
  );

  const [tocOpen, setTocOpen] = useState(false);
  const [desktopSidebar, setDesktopSidebar] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const apply = () => setDesktopSidebar(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (!tocOpen || desktopSidebar) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setTocOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [tocOpen, desktopSidebar]);

  const hasNav = navEntries.length > 0;
  const showMobileDrawer = hasNav && !desktopSidebar;

  const scrollToDetailSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (!desktopSidebar) setTocOpen(false);
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
      <div className="panel-head panel-head--detail team-detail-panel-head">
        <h2 className="panel-title">Chi tiết đội &amp; hệ thống</h2>
        {showMobileDrawer ? (
          <button
            type="button"
            className="team-detail-toc-trigger"
            onClick={() => setTocOpen(true)}
            aria-expanded={tocOpen}
            aria-controls="team-detail-toc-panel"
          >
            Mục lục
          </button>
        ) : null}
      </div>
      {hasNav && desktopSidebar ? (
        <div className="team-detail-nav-chips" role="navigation" aria-label="Neo nhanh trong trang">
          <div className="team-detail-nav-chips__scroll">
            {navLinkEntries.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`team-detail-nav-chip${item.emphasis === "r2-04" ? " team-detail-nav-chip--emphasis" : ""}`}
                onClick={() => scrollToDetailSection(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <div className={`team-detail-page-layout${hasNav ? " team-detail-page-layout--has-toc" : ""}`}>
        {showMobileDrawer && tocOpen ? (
          <button
            type="button"
            className="team-detail-toc-backdrop"
            aria-label="Đóng mục lục"
            onClick={() => setTocOpen(false)}
          />
        ) : null}
        {hasNav ? (
          <nav
            id="team-detail-toc-panel"
            className={`team-detail-toc${desktopSidebar ? " team-detail-toc--sidebar" : " team-detail-toc-drawer"}${!desktopSidebar && tocOpen ? " team-detail-toc-drawer--open" : ""}`}
            aria-hidden={!desktopSidebar && !tocOpen}
            aria-label="Mục lục trang chi tiết đội"
          >
            <div className="team-detail-toc-drawer__head">
              <p className="team-detail-toc__title">Mục lục</p>
              <button
                type="button"
                className="team-detail-toc-drawer__close"
                onClick={() => setTocOpen(false)}
                aria-label="Đóng mục lục"
              >
                ×
              </button>
            </div>
            <ul className="team-detail-toc__list team-detail-toc__list--structured">
              {navEntries.map((entry, idx) =>
                entry.kind === "heading" ? (
                  <li key={`h-${idx}-${entry.label}`} className="team-detail-toc__heading">
                    {entry.label}
                  </li>
                ) : (
                  <li key={entry.id}>
                    <button
                      type="button"
                      className={`team-detail-toc__link${entry.emphasis === "r2-04" ? " team-detail-toc__link--emphasis" : ""}`}
                      onClick={() => scrollToDetailSection(entry.id)}
                    >
                      {entry.label}
                    </button>
                  </li>
                )
              )}
            </ul>
          </nav>
        ) : null}
        <div className="team-detail-page-main">
          <TeamDetail
            teamId={selectedTeam}
            teams={teamOptions}
            onTeamChange={handleTeamChange}
            onOpenTeam={onOpenTeam}
            rows={teamFeed}
            loading={loadingTeam}
          />
        </div>
      </div>
    </section>
  );
}

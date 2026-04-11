import type { CSSProperties, ReactNode } from "react";

/**
 * LLM thường dùng Markdown `**đoạn**` để nhấn mạnh; React không parse Markdown nên cần chuyển thành <strong>.
 * Giữ nguyên chuỗi còn lại (xuống dòng, bullet) — class `prose-pre` vẫn dùng white-space: pre-wrap.
 */
function renderTextWithMarkdownBold(text: string): ReactNode {
  const nodes: ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < text.length) {
    const open = text.indexOf("**", i);
    if (open === -1) {
      nodes.push(text.slice(i));
      break;
    }
    if (open > i) {
      nodes.push(text.slice(i, open));
    }
    const close = text.indexOf("**", open + 2);
    if (close === -1) {
      nodes.push(text.slice(open));
      break;
    }
    nodes.push(<strong key={`md-b-${key++}`}>{text.slice(open + 2, close)}</strong>);
    i = close + 2;
  }
  if (nodes.length === 0) return text;
  if (nodes.length === 1) return nodes[0];
  return <>{nodes}</>;
}

/** AI-generated text often uses newlines and "- " bullets — preserve layout. */
export function ProsePre({ children, className = "" }: { children: string | null | undefined; className?: string }) {
  if (!children?.trim()) return null;
  return <div className={`prose-pre ${className}`.trim()}>{renderTextWithMarkdownBold(children)}</div>;
}

export function SectionLabel({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="section-label">
      {icon ? <span className="section-label-icon">{icon}</span> : null}
      <span>{children}</span>
    </div>
  );
}

export function MetaChips({ items }: { items: Array<{ label: string; value: string }> }) {
  return (
    <div className="meta-chips">
      {items.map(({ label, value }) => (
        <span key={label} className="meta-chip" title={`${label}: ${value}`}>
          <span className="meta-chip-label">{label}</span>
          <span className="meta-chip-value">{value}</span>
        </span>
      ))}
    </div>
  );
}

export function ProjectToolsPanels({
  projectAbout,
  toolsBullets,
  variant = "default",
}: {
  projectAbout?: string | null;
  toolsBullets?: string | null;
  /** `hero` = nhấn mạnh block đầu trang (đọc trước tổng quan). */
  variant?: "default" | "hero";
}) {
  const hasProject = Boolean(projectAbout?.trim());
  const hasTools = Boolean(toolsBullets?.trim());
  if (!hasProject && !hasTools) return null;
  const gridClass = variant === "hero" ? "project-tools-grid project-tools-grid--hero" : "project-tools-grid";
  return (
    <div className={gridClass}>
      {hasProject ? (
        <div className={`insight-card insight-card--project ${variant === "hero" ? "insight-card--hero" : ""}`}>
          <SectionLabel icon="◆">Mô tả hệ thống</SectionLabel>
          <ProsePre>{projectAbout!}</ProsePre>
        </div>
      ) : null}
      {hasTools ? (
        <div className={`insight-card insight-card--tools ${variant === "hero" ? "insight-card--hero" : ""}`}>
          <SectionLabel icon="◇">Công cụ của hệ thống</SectionLabel>
          <ProsePre>{toolsBullets!}</ProsePre>
        </div>
      ) : null}
    </div>
  );
}

/** Gợi ý khi AI chưa trả project_about / tools_plain_bullets */
export function IdentityPlaceholder() {
  return (
    <div className="identity-placeholder">
      <p>
        Chưa có <strong>mô tả hệ thống</strong> và <strong>danh sách công cụ</strong> trong dữ liệu review. Khi pipeline LLM ghi đủ{" "}
        <code>project_about</code> và <code>tools_plain_bullets</code>, hai khối trên sẽ hiện ở đây.
      </p>
    </div>
  );
}

export function Skeleton({ className = "", style }: { className?: string; style?: CSSProperties }) {
  return <div className={`skeleton ${className}`.trim()} style={style} aria-hidden />;
}

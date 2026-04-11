import type { CriteriaComments, SmbScaleAdvisory } from "../types/reviews";
import { extractCriteriaComments, extractSmbScaleAdvisory } from "../types/reviews";
import { ProsePre, SectionLabel } from "./Presentation";

const RUBRIC_R1_LABELS: Array<{ key: keyof CriteriaComments; label: string }> = [
  { key: "R1_01", label: "R1_01 · Domain fit" },
  { key: "R1_02", label: "R1_02 · Data pipeline" },
  { key: "R1_03", label: "R1_03 · Retrieval" },
  { key: "R1_04", label: "R1_04 · Intent & prompting" },
  { key: "R1_05", label: "R1_05 · Slide & trình bày" },
];

const RUBRIC_R2_LABELS: Array<{ key: keyof CriteriaComments; label: string }> = [
  { key: "R2_01", label: "R2_01 · Tư duy Agent & multi-hop (25%)" },
  { key: "R2_02", label: "R2_02 · Quản lý tài nguyên model (25%)" },
  { key: "R2_03", label: "R2_03 · Thực tế & tối ưu vận hành (15%)" },
  { key: "R2_04", label: "R2_04 · Mở rộng & sáng tạo (15%)" },
  { key: "R2_05", label: "R2_05 · Phản biện hội đồng (20%)" },
];

/** Rubric R1/R2 chỉ từ bản tổng hợp đội (`team_aggregate`). */
export function TeamAggregateCriteriaSections({
  structuredOutput,
}: {
  structuredOutput: Record<string, unknown> | null;
}) {
  const criteria = extractCriteriaComments(structuredOutput);
  if (!criteria) return null;

  const hasR1 = RUBRIC_R1_LABELS.some(({ key }) => Boolean(criteria[key]));
  const hasR2 = RUBRIC_R2_LABELS.some(({ key }) => Boolean(criteria[key]));
  if (!hasR1 && !hasR2) return null;

  const renderGroup = (
    title: string,
    labels: typeof RUBRIC_R1_LABELS,
    extraClass?: string
  ) => (
    <div className={`criteria-box criteria-aggregate-rubric${extraClass ? ` ${extraClass}` : ""}`}>
      <span className="criteria-title">{title}</span>
      {labels.map(({ key, label }) =>
        criteria[key] ? (
          <div key={key} style={{ marginTop: 12 }}>
            <span className="criteria-item-label">{label}</span>
            <ProsePre>{criteria[key] as string}</ProsePre>
          </div>
        ) : null
      )}
    </div>
  );

  return (
    <div className="criteria-rubric-stack">
      {hasR1 ? renderGroup("Tiêu chí R1 — toàn hệ thống", RUBRIC_R1_LABELS) : null}
      {hasR2 ? renderGroup("Tiêu chí R2 — toàn hệ thống", RUBRIC_R2_LABELS, "criteria-aggregate-rubric--r2") : null}
    </div>
  );
}

const SMB_ADVISORY_ROWS: Array<{ field: keyof SmbScaleAdvisory; label: string }> = [
  { field: "summary", label: "Tóm tắt" },
  { field: "tech_and_architecture", label: "Công nghệ & kiến trúc" },
  { field: "cost_for_smb", label: "Chi phí & phù hợp SMB" },
  { field: "throughput_and_reliability", label: "Throughput & độ tin cậy" },
  { field: "observability_and_operations", label: "Quan sát & vận hành" },
  { field: "data_and_integrations", label: "Dữ liệu & tích hợp" },
];

export function SmbScaleAdvisoryPanel({
  structuredOutput,
}: {
  structuredOutput: Record<string, unknown> | null;
}) {
  const adv = extractSmbScaleAdvisory(structuredOutput);
  if (!adv) return null;

  const rows = SMB_ADVISORY_ROWS.map(({ field, label }) => {
    const text = adv[field];
    const trimmed = typeof text === "string" ? text.trim() : "";
    return trimmed ? { field, label, text: trimmed } : null;
  }).filter(Boolean) as Array<{ field: string; label: string; text: string }>;

  if (rows.length === 0) return null;

  return (
    <div className="criteria-box smb-scale-advisory-panel" aria-label="Gợi ý cải tiến SMB và quy mô">
      <SectionLabel icon="◇">Gợi ý cải tiến (SMB &amp; quy mô)</SectionLabel>
      {rows.map(({ field, label, text }) => (
        <div key={field} className="smb-scale-advisory-panel__row">
          <span className="criteria-item-label">{label}</span>
          <ProsePre>{text}</ProsePre>
        </div>
      ))}
    </div>
  );
}

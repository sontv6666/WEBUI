/** Neo mục lục trang chi tiết — khớp id trên DOM */

export const TEAM_DETAIL_FALLBACK_IDS = {
  identity: "team-detail-identity",
  latestPush: "team-detail-latest-push",
  pushList: "team-detail-push-list",
} as const;

export function navIdAssessment(key: string): string {
  return `aggregate-assessment-${key}`;
}

export function navIdCriteria(criteriaKey: string): string {
  return `aggregate-criteria-${criteriaKey}`;
}

export function navIdSmb(field: string): string {
  return `aggregate-smb-${field}`;
}

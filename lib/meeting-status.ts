/** DB `meeting_requests.status`와 맞춘 값 */
export const STATUS_VALUES = {
  approved: "confirmed",
  rejected: "rejected",
} as const;

/** 대시보드·목록에서 '진행 중'으로 묶는 상태 */
export const IN_PROGRESS_STATUSES = [
  "received",
  "reviewing",
  "slot_checking",
  "preparing",
] as const;

export type InProgressStatus = (typeof IN_PROGRESS_STATUSES)[number];

export function isInProgressStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  return (IN_PROGRESS_STATUSES as readonly string[]).includes(status);
}

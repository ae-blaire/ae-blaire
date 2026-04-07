import type { RiskType } from "@/lib/risk";

type MaybeSlot = unknown | null | undefined;

type ChecklistLike = {
  invite_sent?: boolean | null;
  venue_confirmed?: boolean | null;
  access_registered?: boolean | null;
  parking_registered?: boolean | null;
  equipment_checked?: boolean | null;
  attendee_finalized?: boolean | null;
};

type DetailWarningInput = {
  selectedSlot?: MaybeSlot;
  checklist?: ChecklistLike | null;
  riskType?: RiskType | undefined;
};

export function canConfirmRequest(selectedSlot: MaybeSlot) {
  return !!selectedSlot;
}

export function getChecklistCompletedCount(checklist?: ChecklistLike | null) {
  if (!checklist) return 0;

  const fields = [
    checklist.invite_sent,
    checklist.venue_confirmed,
    checklist.access_registered,
    checklist.parking_registered,
    checklist.equipment_checked,
    checklist.attendee_finalized,
  ];

  return fields.filter(Boolean).length;
}

export function canCompleteRequest(checklist?: ChecklistLike | null) {
  return getChecklistCompletedCount(checklist) === 6;
}

export function getDetailWarningMessage({
  selectedSlot,
  checklist,
  riskType,
}: DetailWarningInput) {
  if (!selectedSlot) {
    return "⚠️ 아직 슬롯이 선택되지 않았습니다. 확정 전에 최종 시간을 먼저 선택해야 합니다.";
  }

  const checklistCount = getChecklistCompletedCount(checklist);

  if (checklistCount < 6) {
    return `🚨 준비가 ${checklistCount}/6 완료되었습니다. 모든 체크리스트 완료 후 종료할 수 있습니다.`;
  }

  if (riskType === "urgent_no_slot") {
    return "🔥 긴급 요청인데 아직 확정 슬롯이 없습니다. 우선적으로 시간 확보가 필요합니다.";
  }

  if (riskType === "confirmed_unprepared") {
    return "🚨 일정은 확정되었지만 준비가 부족합니다. 실행 체크리스트를 먼저 확인해주세요.";
  }

  if (riskType === "today_unprepared") {
    return "⚠️ 오늘 일정인데 준비가 아직 완료되지 않았습니다. 즉시 점검이 필요합니다.";
  }

  return null;
}

export function confirmAction(message: string) {
  return window.confirm(message);
}

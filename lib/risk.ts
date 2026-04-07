type ChecklistLike = {
  invite_sent?: boolean | null;
  venue_confirmed?: boolean | null;
  access_registered?: boolean | null;
  parking_registered?: boolean | null;
  equipment_checked?: boolean | null;
  attendee_finalized?: boolean | null;
} | null;

type SlotLike = {
  start_datetime?: string | null;
  end_datetime?: string | null;
} | null;

export type RiskType =
  | "urgent_no_slot"
  | "confirmed_unprepared"
  | "today_unprepared"
  | null;

type RiskInput = {
  status?: string | null;
  urgency_level?: number | string | null;
  urgency?: number | string | null;
  slot?: SlotLike;
  selectedSlot?: SlotLike;
  selected_slot?: SlotLike;
  checklist?: ChecklistLike;
  checklistCompletedCount?: number | null;
};

export function getChecklistCount(checklist: ChecklistLike) {
  if (!checklist) return 0;

  return [
    checklist.invite_sent,
    checklist.venue_confirmed,
    checklist.access_registered,
    checklist.parking_registered,
    checklist.equipment_checked,
    checklist.attendee_finalized,
  ].filter(Boolean).length;
}

function normalizeUrgency(value: number | string | null | undefined) {
  if (typeof value === "number") return value;

  if (typeof value === "string") {
    const trimmed = value.trim().toLowerCase();

    if (!trimmed) return 0;

    const numeric = Number(trimmed);
    if (!Number.isNaN(numeric)) return numeric;

    if (["low", "낮음", "하"].includes(trimmed)) return 1;
    if (["medium", "보통", "중", "mid", "normal"].includes(trimmed)) return 3;
    if (["high", "높음", "상"].includes(trimmed)) return 5;
    if (["urgent", "긴급", "최상", "asap"].includes(trimmed)) return 5;
  }

  return 0;
}

export function getRiskType(item: RiskInput): RiskType {
  const checklistCount =
    item.checklistCompletedCount ?? getChecklistCount(item.checklist ?? null);

  const status = item.status ?? "";
  const urgency = normalizeUrgency(item.urgency_level ?? item.urgency);
  const finalSlot =
    item.slot ?? item.selectedSlot ?? item.selected_slot ?? null;

  const today = new Date().toISOString().slice(0, 10);
  const slotDate = finalSlot?.start_datetime?.slice(0, 10);

  const isUrgentNoSlot =
    ["received", "reviewing", "slot_checking"].includes(status) &&
    urgency >= 4 &&
    !finalSlot;

  const isConfirmedUnprepared =
    ["confirmed", "preparing"].includes(status) &&
    checklistCount < 6;

  const isTodayUnprepared =
    ["confirmed", "preparing"].includes(status) &&
    slotDate === today &&
    checklistCount < 6;

  if (isTodayUnprepared) return "today_unprepared";
  if (isUrgentNoSlot) return "urgent_no_slot";
  if (isConfirmedUnprepared) return "confirmed_unprepared";

  return null;
}

import type { SupabaseClient } from "@supabase/supabase-js";

type ChecklistLike = {
  invite_sent?: boolean | null;
  venue_confirmed?: boolean | null;
  access_registered?: boolean | null;
  parking_registered?: boolean | null;
  equipment_checked?: boolean | null;
  attendee_finalized?: boolean | null;
};

const CHECKLIST_FIELDS = [
  "invite_sent",
  "venue_confirmed",
  "access_registered",
  "parking_registered",
  "equipment_checked",
  "attendee_finalized",
] as const;

export function isChecklistCompleted(checklist: ChecklistLike) {
  return CHECKLIST_FIELDS.every((field) => Boolean(checklist[field]));
}

export function hasAnyChecklistProgress(checklist: ChecklistLike) {
  return CHECKLIST_FIELDS.some((field) => Boolean(checklist[field]));
}

export async function syncMeetingRequestStatusByChecklist({
  supabase,
  meetingRequestId,
  currentStatus,
  checklist,
}: {
  supabase: SupabaseClient;
  meetingRequestId: string | number;
  currentStatus: string | null | undefined;
  checklist: ChecklistLike;
}) {
  if (!currentStatus) {
    return currentStatus ?? null;
  }

  if (["received", "reviewing", "slot_checking", "rejected"].includes(currentStatus)) {
    return currentStatus;
  }

  if (currentStatus === "done") {
    return currentStatus;
  }

  const completed = isChecklistCompleted(checklist);
  const hasAnyChecked = hasAnyChecklistProgress(checklist);
  const nextStatus = completed
    ? "done"
    : hasAnyChecked
    ? "preparing"
    : "confirmed";

  if (currentStatus !== nextStatus) {
    const { error } = await supabase
      .from("meeting_requests")
      .update({ status: nextStatus })
      .eq("id", meetingRequestId);

    if (error) {
      throw new Error(`${nextStatus} 자동 전환 실패: ${error.message}`);
    }
  }

  return nextStatus;
}

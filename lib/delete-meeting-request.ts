import type { SupabaseClient } from "@supabase/supabase-js";

export async function deleteMeetingRequestWithRelations({
  supabase,
  meetingRequestId,
}: {
  supabase: SupabaseClient;
  meetingRequestId: string | number;
}) {
  const { error: checklistError } = await supabase
    .from("execution_checklists")
    .delete()
    .eq("meeting_request_id", meetingRequestId);

  if (checklistError) {
    throw new Error(`체크리스트 삭제 실패: ${checklistError.message}`);
  }

  const { error: slotError } = await supabase
    .from("meeting_slot_candidates")
    .delete()
    .eq("meeting_request_id", meetingRequestId);

  if (slotError) {
    throw new Error(`슬롯 후보 삭제 실패: ${slotError.message}`);
  }

  const { data: deletedRows, error: requestError } = await supabase
    .from("meeting_requests")
    .delete()
    .eq("id", meetingRequestId)
    .select("id");

  if (requestError) {
    throw new Error(`미팅 요청 삭제 실패: ${requestError.message}`);
  }

  if (!deletedRows || deletedRows.length === 0) {
    throw new Error(
      "미팅 요청 삭제 실패: 실제로 삭제된 row가 없어요. 권한(RLS) 또는 대상 row를 확인해주세요."
    );
  }
}

"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { syncMeetingRequestStatusByChecklist } from "@/lib/checklist-status";

type MeetingRequest = {
  id: string | number;
  title: string;
  requester_name: string | null;
  status: string | null;
  preferred_date_range: string | null;
};

type ExecutionChecklist = {
  id: string | number;
  meeting_request_id: string | number;
  invite_sent: boolean | null;
  venue_confirmed: boolean | null;
  access_registered: boolean | null;
  parking_registered: boolean | null;
  equipment_checked: boolean | null;
  attendee_finalized: boolean | null;
  onsite_owner: string | null;
  room_info: string | null;
  special_notes: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type ChecklistCard = ExecutionChecklist & {
  meetingTitle: string;
  requesterName: string | null;
  meetingStatus: string | null;
  preferredDateRange: string | null;
};

function ExecutionChecklistsContent() {
  const searchParams = useSearchParams();
  const requestId = searchParams.get("requestId");

  const [items, setItems] = useState<ChecklistCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [savingId, setSavingId] = useState<string | number | null>(null);
  const [filter, setFilter] = useState<"all" | "completed" | "incomplete">("all");

  async function fetchChecklists() {
    setLoading(true);
    setErrorMessage("");

    const { data: checklistData, error: checklistError } = await supabase
      .from("execution_checklists")
      .select("*")
      .order("created_at", { ascending: false });

    if (checklistError) {
      console.error("체크리스트 조회 에러:", checklistError);
      setErrorMessage(`체크리스트 조회 실패: ${checklistError.message}`);
      setLoading(false);
      return;
    }

    const { data: meetingData, error: meetingError } = await supabase
      .from("meeting_requests")
      .select("id, title, requester_name, status, preferred_date_range");

    if (meetingError) {
      console.error("미팅 조회 에러:", meetingError);
      setErrorMessage(`미팅 정보 조회 실패: ${meetingError.message}`);
      setLoading(false);
      return;
    }

    const meetingMap = new Map<string, MeetingRequest>();
    (meetingData || []).forEach((meeting) => {
      meetingMap.set(String(meeting.id), meeting as MeetingRequest);
    });

    const mergedItems: ChecklistCard[] = (checklistData || []).map((item) => {
      const meeting = meetingMap.get(String(item.meeting_request_id));

      return {
        ...(item as ExecutionChecklist),
        meetingTitle: meeting?.title || "제목 없음",
        requesterName: meeting?.requester_name || null,
        meetingStatus: meeting?.status || null,
        preferredDateRange: meeting?.preferred_date_range || null,
      };
    });

    setItems(mergedItems);
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 시 Supabase 로드
    void fetchChecklists();
  }, []);

const filteredItems = useMemo(() => {
  let result = items;

  if (requestId) {
    result = result.filter(
      (item) => String(item.meeting_request_id) === String(requestId)
    );
  }

  if (filter === "completed") {
    result = result.filter((item) => isChecklistCompleted(item));
  }

  if (filter === "incomplete") {
    result = result.filter((item) => !isChecklistCompleted(item));
  }

  return [...result].sort((a, b) => {
    const aCompleted = isChecklistCompleted(a);
    const bCompleted = isChecklistCompleted(b);

    if (aCompleted !== bCompleted) {
      return aCompleted ? 1 : -1;
    }

    return (
      new Date(b.created_at || 0).getTime() -
      new Date(a.created_at || 0).getTime()
    );
  });
}, [items, requestId, filter]);

  async function toggleField(
    item: ChecklistCard,
    field:
      | "invite_sent"
      | "venue_confirmed"
      | "access_registered"
      | "parking_registered"
      | "equipment_checked"
      | "attendee_finalized",
    currentValue: boolean | null
  ) {
    setSavingId(item.id);
    setErrorMessage("");

    const nextValue = !currentValue;

    const { error } = await supabase
      .from("execution_checklists")
      .update({ [field]: nextValue })
      .eq("id", item.id);

    if (error) {
      console.error("체크리스트 업데이트 에러:", error);
      setErrorMessage(`체크리스트 저장 실패: ${error.message}`);
      setSavingId(null);
      return;
    }

    try {
      await syncMeetingRequestStatusByChecklist({
        supabase,
        meetingRequestId: item.meeting_request_id,
        currentStatus: item.meetingStatus,
        checklist: {
          invite_sent:
            field === "invite_sent" ? nextValue : item.invite_sent,
          venue_confirmed:
            field === "venue_confirmed" ? nextValue : item.venue_confirmed,
          access_registered:
            field === "access_registered" ? nextValue : item.access_registered,
          parking_registered:
            field === "parking_registered" ? nextValue : item.parking_registered,
          equipment_checked:
            field === "equipment_checked" ? nextValue : item.equipment_checked,
          attendee_finalized:
            field === "attendee_finalized" ? nextValue : item.attendee_finalized,
        },
      });
    } catch (syncError) {
      console.error("체크리스트 상태 동기화 에러:", syncError);
      setErrorMessage(
        syncError instanceof Error
          ? syncError.message
          : "상태 동기화 중 오류가 발생했어요."
      );
      setSavingId(null);
      await fetchChecklists();
      return;
    }

    await fetchChecklists();
    setSavingId(null);
  }

  async function updateTextField(
    checklistId: string | number,
    field: "onsite_owner" | "room_info" | "special_notes",
    value: string
  ) {
    setSavingId(checklistId);
    setErrorMessage("");

    const { error } = await supabase
      .from("execution_checklists")
      .update({ [field]: value || null })
      .eq("id", checklistId);

    if (error) {
      console.error("텍스트 업데이트 에러:", error);
      setErrorMessage(`저장 실패: ${error.message}`);
      setSavingId(null);
      return;
    }

    await fetchChecklists();
    setSavingId(null);
  }

  function getStatusLabel(status: string | null) {
    if (!status) return "-";

    switch (status) {
      case "received":
        return "접수";
      case "reviewing":
        return "검토중";
      case "slot_checking":
        return "슬롯 확인중";
      case "confirmed":
        return "확정";
      case "preparing":
        return "실행 준비중";
      case "done":
        return "완료";
      case "rejected":
        return "거절";
      default:
        return status;
    }
  }

  function getCompletedCount(item: ChecklistCard) {
    return [
      item.invite_sent,
      item.venue_confirmed,
      item.access_registered,
      item.parking_registered,
      item.equipment_checked,
      item.attendee_finalized,
    ].filter(Boolean).length;
  }
  function isChecklistCompleted(item: ChecklistCard) {
  return [
    item.invite_sent,
    item.venue_confirmed,
    item.access_registered,
    item.parking_registered,
    item.equipment_checked,
    item.attendee_finalized,
  ].every(Boolean);
}

  return (
    <div className="min-h-screen bg-gray-50 px-6 py-8">
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-2 text-2xl font-bold text-gray-900">
          Execution Checklists
        </h1>

        <p className="mb-6 text-sm text-gray-600">
          실행 준비 체크리스트를 확인하고 수정하는 페이지예요.
        </p>
<div className="mb-6 flex flex-wrap gap-2">
  <button
    type="button"
    onClick={() => setFilter("all")}
    className={`rounded-xl px-4 py-2 text-sm font-medium ${
      filter === "all"
        ? "bg-gray-900 text-white ring-2 ring-gray-300 shadow-sm"
        : "bg-gray-200 text-gray-800 hover:bg-gray-300"
    }`}
  >
    전체
  </button>

  <button
    type="button"
    onClick={() => setFilter("incomplete")}
    className={`rounded-xl px-4 py-2 text-sm font-medium ${
      filter === "incomplete"
        ? "bg-yellow-500 text-white ring-2 ring-yellow-300 shadow-sm"
        : "bg-yellow-100 text-yellow-800 hover:bg-yellow-200"
    }`}
  >
    미완료
  </button>

  <button
    type="button"
    onClick={() => setFilter("completed")}
    className={`rounded-xl px-4 py-2 text-sm font-medium ${
      filter === "completed"
        ? "bg-green-600 text-white ring-2 ring-green-300 shadow-sm"
        : "bg-green-100 text-green-800 hover:bg-green-200"
    }`}
  >
    완료
  </button>
</div>
      
        {errorMessage && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        )}

        {loading ? (
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <p className="text-sm text-gray-600">불러오는 중...</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <p className="text-sm text-gray-600">
              표시할 체크리스트가 없어요.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {filteredItems.map((item) => {
              const saving = savingId === item.id;

              return (
                <div
                  key={String(item.id)}
                  className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100"
                >
                  <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900">
                        {item.meetingTitle}
                      </h2>

                      <div className="mt-2 space-y-1 text-sm text-gray-600">
                        <p>
                          <span className="font-medium">요청자:</span>{" "}
                          {item.requesterName || "-"}
                        </p>
                        <p>
                          <span className="font-medium">상태:</span>{" "}
                          {getStatusLabel(item.meetingStatus)}
                        </p>
                        <p>
                          <span className="font-medium">희망 시기:</span>{" "}
                          {item.preferredDateRange || "-"}
                        </p>
                        <p className="text-xs text-gray-500">
                          checklist_id: {String(item.id)} / meeting_request_id:{" "}
                          {String(item.meeting_request_id)}
                        </p>
                      </div>
                    </div>

                    <div className="rounded-xl bg-gray-50 px-4 py-2 text-sm text-gray-700">
                      완료 {getCompletedCount(item)}/6
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <ToggleRow
                      label="캘린더 인비 발송"
                      checked={!!item.invite_sent}
                      disabled={saving}
                      onChange={() =>
                        toggleField(item, "invite_sent", item.invite_sent)
                      }
                    />

                    <ToggleRow
                      label="장소 확정"
                      checked={!!item.venue_confirmed}
                      disabled={saving}
                      onChange={() =>
                        toggleField(
                          item,
                          "venue_confirmed",
                          item.venue_confirmed
                        )
                      }
                    />

                    <ToggleRow
                      label="출입 등록"
                      checked={!!item.access_registered}
                      disabled={saving}
                      onChange={() =>
                        toggleField(
                          item,
                          "access_registered",
                          item.access_registered
                        )
                      }
                    />

                    <ToggleRow
                      label="주차 등록"
                      checked={!!item.parking_registered}
                      disabled={saving}
                      onChange={() =>
                        toggleField(
                          item,
                          "parking_registered",
                          item.parking_registered
                        )
                      }
                    />

                    <ToggleRow
                      label="장비 확인"
                      checked={!!item.equipment_checked}
                      disabled={saving}
                      onChange={() =>
                        toggleField(
                          item,
                          "equipment_checked",
                          item.equipment_checked
                        )
                      }
                    />

                    <ToggleRow
                      label="참석자 최종 확인"
                      checked={!!item.attendee_finalized}
                      disabled={saving}
                      onChange={() =>
                        toggleField(
                          item,
                          "attendee_finalized",
                          item.attendee_finalized
                        )
                      }
                    />
                  </div>

                  <div className="mt-6 grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700">
                        현장 담당자
                      </label>
                      <input
                        type="text"
                        defaultValue={item.onsite_owner || ""}
                        placeholder="예: 홍길동"
                        disabled={saving}
                        onBlur={(e) =>
                          updateTextField(item.id, "onsite_owner", e.target.value)
                        }
                        className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700">
                        장소 / 룸 정보
                      </label>
                      <input
                        type="text"
                        defaultValue={item.room_info || ""}
                        placeholder="예: 12층 대회의실"
                        disabled={saving}
                        onBlur={(e) =>
                          updateTextField(item.id, "room_info", e.target.value)
                        }
                        className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
                      />
                    </div>
                  </div>

                  <div className="mt-4">
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      특이사항
                    </label>
                    <textarea
                      rows={4}
                      defaultValue={item.special_notes || ""}
                      placeholder="특이사항 입력"
                      disabled={saving}
                      onBlur={(e) =>
                        updateTextField(item.id, "special_notes", e.target.value)
                      }
                      className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm outline-none focus:border-gray-400"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ExecutionChecklistsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 px-6 py-8">
          <div className="mx-auto max-w-5xl rounded-2xl bg-white p-6 shadow-sm">
            <p className="text-sm text-gray-600">불러오는 중...</p>
          </div>
        </div>
      }
    >
      <ExecutionChecklistsContent />
    </Suspense>
  );
}

type ToggleRowProps = {
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: () => void;
};

function ToggleRow({ label, checked, disabled, onChange }: ToggleRowProps) {
  return (
    <label className="flex items-center gap-3 rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-700">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        className="h-4 w-4"
      />
      <span>{label}</span>
    </label>
  );
}

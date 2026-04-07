"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

import RiskBadge from "@/components/RiskBadge";
import { canConfirmRequest } from "@/lib/uiRules";
import { getRiskType } from "@/lib/risk";
import { deleteMeetingRequestWithRelations } from "@/lib/delete-meeting-request";
import { getParticipantsDisplayText } from "@/lib/participants";

type MeetingRequest = {
  id: string | number;
  title: string;
  purpose: string | null;
  requester_name: string | null;
  participants_text: string | null;
  external_flag: boolean | null;
  preferred_date_range: string | null;
  importance_level: string | null;
  urgency_level: string | null;
  planning_notes: string | null;
  background_notes: string | null;
  executive_required_flag: boolean | null;
  status: string | null;
  duration_minutes: number | null;
  notes: string | null;
  importance?: string | null;
  urgency?: string | null;
  memo?: string | null;
  created_at: string | null;
};

function normalizeMeetingRequest(item: MeetingRequest): MeetingRequest {
  return {
    ...item,
    importance_level: item.importance_level ?? item.importance ?? null,
    urgency_level: item.urgency_level ?? item.urgency ?? null,
    planning_notes: item.planning_notes ?? item.memo ?? item.notes ?? null,
    background_notes: item.background_notes ?? null,
  };
}

function getPrimaryPlanningNotes(item: MeetingRequest) {
  return item.planning_notes ?? item.memo ?? item.notes ?? "-";
}

type SelectedSlotMapItem = {
  id: string;
  start_datetime: string;
  end_datetime: string;
  proposed_by: string | null;
  note: string | null;
};

function MeetingRequestsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const status = searchParams.get("status");

  const [requests, setRequests] = useState<MeetingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | number | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [checklistProgressMap, setChecklistProgressMap] = useState<
    Record<string, { completed: boolean; completedCount: number }>
  >({});
  const [selectedSlotMap, setSelectedSlotMap] = useState<
    Record<string, SelectedSlotMapItem>
  >({});

  async function fetchMeetingRequests() {
    setLoading(true);
    setErrorMessage("");

    const { data, error } = await supabase
      .from("meeting_requests")
      .select("*")
      .order("created_at", { ascending: false });

    const { data: checklistData, error: checklistError } = await supabase
      .from("execution_checklists")
      .select(
        "meeting_request_id, invite_sent, venue_confirmed, access_registered, parking_registered, equipment_checked, attendee_finalized"
      );

    const { data: selectedSlotData, error: selectedSlotError } = await supabase
      .from("meeting_slot_candidates")
      .select(
        "id, meeting_request_id, start_datetime, end_datetime, proposed_by, note"
      )
      .eq("is_selected", true);

    if (checklistError) {
      console.error("체크리스트 조회 에러:", checklistError);
      setErrorMessage(`체크리스트를 불러오지 못했어요. (${checklistError.message})`);
      setLoading(false);
      return;
    }

    if (selectedSlotError) {
      console.error("확정 슬롯 조회 에러:", selectedSlotError);
      setErrorMessage(`확정 슬롯을 불러오지 못했어요. (${selectedSlotError.message})`);
      setLoading(false);
      return;
    }

    const nextChecklistProgressMap: Record<
      string,
      { completed: boolean; completedCount: number }
    > = {};

    (checklistData || []).forEach((item) => {
      const completedCount = [
        item.invite_sent,
        item.venue_confirmed,
        item.access_registered,
        item.parking_registered,
        item.equipment_checked,
        item.attendee_finalized,
      ].filter(Boolean).length;

      nextChecklistProgressMap[String(item.meeting_request_id)] = {
        completed: completedCount === 6,
        completedCount,
      };
    });

    const nextSelectedSlotMap: Record<string, SelectedSlotMapItem> = {};

    (selectedSlotData || []).forEach((slot) => {
      nextSelectedSlotMap[String(slot.meeting_request_id)] = {
        id: slot.id,
        start_datetime: slot.start_datetime,
        end_datetime: slot.end_datetime,
        proposed_by: slot.proposed_by,
        note: slot.note,
      };
    });

    if (error) {
      console.error("미팅 요청 조회 에러:", error);
      setErrorMessage(`미팅 요청을 불러오지 못했어요. (${error.message})`);
      setLoading(false);
      return;
    }

    setRequests(
      ((data as MeetingRequest[]) || []).map((item) => normalizeMeetingRequest(item))
    );
    setChecklistProgressMap(nextChecklistProgressMap);
    setSelectedSlotMap(nextSelectedSlotMap);
    setLoading(false);
  }

  useEffect(() => {
    void fetchMeetingRequests();
  }, []);

  async function createChecklistIfNeeded(meetingRequestId: string | number) {
    const { data: existingChecklist, error: checkError } = await supabase
      .from("execution_checklists")
      .select("id")
      .eq("meeting_request_id", meetingRequestId)
      .maybeSingle();

    if (checkError) {
      console.error("기존 체크리스트 확인 에러:", checkError);
      throw new Error(`기존 체크리스트 확인 실패: ${checkError.message}`);
    }

    if (existingChecklist) {
      return;
    }

    const { error: insertError } = await supabase
      .from("execution_checklists")
      .insert({
        meeting_request_id: meetingRequestId,
        invite_sent: false,
        venue_confirmed: false,
        access_registered: false,
        parking_registered: false,
        equipment_checked: false,
        attendee_finalized: false,
        onsite_owner: null,
        room_info: null,
        special_notes: null,
      });

    if (insertError) {
      console.error("체크리스트 생성 에러:", insertError);
      throw new Error(`체크리스트 생성 실패: ${insertError.message}`);
    }
  }

  async function handleStatusUpdate(
    meetingRequestId: string | number,
    newStatus: string
  ) {
    setUpdatingId(meetingRequestId);
    setErrorMessage("");

    if (newStatus === "confirmed") {
      const { data: selectedSlotData, error: selectedSlotError } = await supabase
        .from("meeting_slot_candidates")
        .select("id")
        .eq("meeting_request_id", meetingRequestId)
        .eq("is_selected", true)
        .maybeSingle();

      if (selectedSlotError) {
        console.error("확정 슬롯 확인 에러:", selectedSlotError);
        setErrorMessage(`확정 슬롯 확인 실패: ${selectedSlotError.message}`);
        setUpdatingId(null);
        return;
      }

      if (!selectedSlotData) {
        setErrorMessage("확정된 시간(슬롯)이 있어야 일정 확정이 가능해요.");
        setUpdatingId(null);
        return;
      }

      if (!window.confirm("이 요청을 확정 상태로 변경할까요?")) {
        setUpdatingId(null);
        return;
      }
    }

    if (newStatus === "done") {
      const { data: checklistData, error: checklistError } = await supabase
        .from("execution_checklists")
        .select(
          "invite_sent, venue_confirmed, access_registered, parking_registered, equipment_checked, attendee_finalized"
        )
        .eq("meeting_request_id", meetingRequestId)
        .maybeSingle();

      if (checklistError) {
        console.error("체크리스트 확인 에러:", checklistError);
        setErrorMessage(`체크리스트 확인 실패: ${checklistError.message}`);
        setUpdatingId(null);
        return;
      }

      if (!checklistData) {
        setErrorMessage("체크리스트가 없어서 완료 처리할 수 없어요.");
        setUpdatingId(null);
        return;
      }

      const isCompleted = [
        checklistData.invite_sent,
        checklistData.venue_confirmed,
        checklistData.access_registered,
        checklistData.parking_registered,
        checklistData.equipment_checked,
        checklistData.attendee_finalized,
      ].every(Boolean);

      if (!isCompleted) {
        setErrorMessage("체크리스트가 아직 모두 완료되지 않았어요.");
        setUpdatingId(null);
        return;
      }

      if (!window.confirm("체크리스트가 모두 완료되었습니다. 완료 처리할까요?")) {
        setUpdatingId(null);
        return;
      }
    }

    if (newStatus === "rejected") {
      if (!window.confirm("이 요청을 보류 상태로 변경할까요?")) {
        setUpdatingId(null);
        return;
      }
    }

    const { data: updatedRows, error: updateError } = await supabase
      .from("meeting_requests")
      .update({ status: newStatus })
      .eq("id", meetingRequestId)
      .select();

    if (updateError) {
      console.error("status 업데이트 에러:", updateError);
      setErrorMessage(
        `상태 변경 실패: ${updateError.message} / status enum 값을 확인해봐.`
      );
      setUpdatingId(null);
      return;
    }

    if (!updatedRows || updatedRows.length === 0) {
      setErrorMessage(
        "상태가 바뀌지 않았어요. id 값, RLS 정책, 또는 status 값이 맞는지 확인해봐."
      );
      setUpdatingId(null);
      return;
    }

    if (newStatus === "confirmed") {
      try {
        await createChecklistIfNeeded(meetingRequestId);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "체크리스트 생성 중 알 수 없는 오류가 발생했어요.";
        setErrorMessage(message);
      }
    }

    await fetchMeetingRequests();
    setUpdatingId(null);
  }

  async function handleDeleteRequest(meetingRequestId: string | number) {
    const confirmed = window.confirm(
      "이 미팅 요청을 삭제할까요? 연결된 슬롯 후보와 체크리스트도 함께 삭제됩니다."
    );
    if (!confirmed) return;

    setUpdatingId(meetingRequestId);
    setErrorMessage("");

    try {
      await deleteMeetingRequestWithRelations({
        supabase,
        meetingRequestId,
      });
      await fetchMeetingRequests();
    } catch (error) {
      console.error("미팅 요청 삭제 에러:", error);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "미팅 요청 삭제 중 오류가 발생했어요."
      );
    } finally {
      setUpdatingId(null);
    }
  }

  function formatDate(dateString: string | null) {
    if (!dateString) return "-";

    try {
      return new Date(dateString).toLocaleString("ko-KR");
    } catch {
      return dateString;
    }
  }

  function formatSlotRange(
    startDateTime: string | null,
    endDateTime: string | null
  ) {
    if (!startDateTime || !endDateTime) return "-";

    try {
      const start = new Date(startDateTime);
      const end = new Date(endDateTime);

      const datePart = start.toLocaleDateString("ko-KR");
      const startTimePart = start.toLocaleTimeString("ko-KR", {
        hour: "2-digit",
        minute: "2-digit",
      });
      const endTimePart = end.toLocaleTimeString("ko-KR", {
        hour: "2-digit",
        minute: "2-digit",
      });

      return `${datePart} ${startTimePart} ~ ${endTimePart}`;
    } catch {
      return `${startDateTime} ~ ${endDateTime}`;
    }
  }

  function formatDuration(minutes: number | null) {
    if (!minutes) return "-";
    if (minutes === 30) return "30분";
    if (minutes % 60 === 0) return `${minutes / 60}시간`;
    return `${Math.floor(minutes / 60)}시간 ${minutes % 60}분`;
  }

  function getStatusLabel(status: string | null) {
    if (!status) return "상태 없음";

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
        return "보류";
      default:
        return status;
    }
  }

  function getStatusBadgeColor(status: string | null) {
    switch (status) {
      case "confirmed":
        return "bg-green-100 text-green-700";
      case "rejected":
        return "bg-red-100 text-red-700";
      case "reviewing":
        return "bg-yellow-100 text-yellow-700";
      case "slot_checking":
        return "bg-blue-100 text-blue-700";
      case "done":
        return "bg-gray-200 text-gray-800";
      case "preparing":
        return "bg-purple-100 text-purple-800";
      default:
        return "bg-gray-100 text-gray-700";
    }
  }

  type StatusAction = {
    label: string;
    nextStatus: string;
    style: "primary" | "secondary" | "danger";
  };

  function getActionButtons(status: string | null): StatusAction[] {
    switch (status) {
      case "received":
        return [
          { label: "검토 시작", nextStatus: "reviewing", style: "secondary" },
          { label: "보류", nextStatus: "rejected", style: "danger" },
        ];

      case "reviewing":
        return [
          { label: "슬롯 확인중", nextStatus: "slot_checking", style: "secondary" },
          { label: "확정", nextStatus: "confirmed", style: "primary" },
          { label: "보류", nextStatus: "rejected", style: "danger" },
        ];

      case "slot_checking":
        return [
          { label: "확정", nextStatus: "confirmed", style: "primary" },
          { label: "다시 검토", nextStatus: "reviewing", style: "secondary" },
          { label: "보류", nextStatus: "rejected", style: "danger" },
        ];

      case "confirmed":
        return [
          { label: "실행 준비중", nextStatus: "preparing", style: "secondary" },
          { label: "다시 검토", nextStatus: "reviewing", style: "secondary" },
          { label: "보류", nextStatus: "rejected", style: "danger" },
        ];

      case "preparing":
        return [
          { label: "완료", nextStatus: "done", style: "primary" },
          { label: "다시 검토", nextStatus: "reviewing", style: "secondary" },
        ];

      case "rejected":
        return [
          { label: "다시 검토", nextStatus: "reviewing", style: "secondary" },
          { label: "확정", nextStatus: "confirmed", style: "primary" },
        ];

      case "done":
        return [
          { label: "다시 실행 준비", nextStatus: "preparing", style: "secondary" },
        ];

      default:
        return [
          { label: "검토 시작", nextStatus: "reviewing", style: "secondary" },
          { label: "보류", nextStatus: "rejected", style: "danger" },
        ];
    }
  }

  function getActionButtonClass(style: "primary" | "secondary" | "danger") {
    switch (style) {
      case "primary":
        return "rounded-xl bg-green-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-green-300";
      case "secondary":
        return "rounded-xl bg-gray-200 px-4 py-2 text-sm font-medium text-gray-800 transition hover:bg-gray-300 disabled:cursor-not-allowed disabled:bg-gray-100";
      case "danger":
        return "rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-300";
      default:
        return "rounded-xl bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700";
    }
  }

  function getStatusPriority(status: string | null) {
    switch (status) {
      case "confirmed":
        return 1;
      case "preparing":
        return 2;
      case "done":
        return 3;
      case "slot_checking":
        return 4;
      case "reviewing":
        return 5;
      case "received":
        return 6;
      case "rejected":
        return 7;
      default:
        return 99;
    }
  }

  function isTodayDateTime(value: string | null) {
    if (!value) return false;

    const date = new Date(value);
    const now = new Date();

    return (
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate()
    );
  }

  function getWarningMessage(params: {
    riskType: string | null;
    selectedSlot: SelectedSlotMapItem | null;
    checklistCompletedCount: number;
  }) {
    const { riskType, selectedSlot, checklistCompletedCount } = params;

    if (riskType === "urgent_no_slot") {
      return "🔥 긴급 요청인데 아직 확정 슬롯이 없어요. 우선적으로 시간 확보가 필요해요.";
    }

    if (riskType === "confirmed_unprepared") {
      return `🚨 일정은 확정됐지만 준비가 ${checklistCompletedCount}/6 완료 상태예요. 체크리스트를 먼저 채워주세요.`;
    }

    if (riskType === "today_unprepared") {
      return `⚠️ 오늘 일정인데 준비가 ${checklistCompletedCount}/6 완료 상태예요. 당일 운영 점검이 필요해요.`;
    }

    if (!selectedSlot) {
      return "⚠️ 아직 선택된 슬롯이 없어요. 확정 전 최종 시간을 먼저 골라야 해요.";
    }

    return null;
  }

  const filterDescription =
    status === "in_progress"
      ? "상태가 「진행중」인 요청만 표시 중"
      : status
      ? `상태가 「${getStatusLabel(status)}」인 요청만 표시 중`
      : null;

  function handleFilterChange(nextStatus: string | null) {
    if (!nextStatus) {
      router.push("/meeting-requests");
      return;
    }
    router.push(`/meeting-requests?status=${nextStatus}`);
  }

  const filteredRequests = (
    status === "in_progress"
      ? requests.filter((r) =>
          ["received", "reviewing", "slot_checking", "preparing"].includes(
            r.status || ""
          )
        )
      : status
      ? requests.filter((r) => r.status === status)
      : requests
  ).sort((a, b) => {
    const statusDiff = getStatusPriority(a.status) - getStatusPriority(b.status);
    if (statusDiff !== 0) return statusDiff;

    const aSlot = selectedSlotMap[String(a.id)];
    const bSlot = selectedSlotMap[String(b.id)];

    if (aSlot && bSlot) {
      return (
        new Date(aSlot.start_datetime).getTime() -
        new Date(bSlot.start_datetime).getTime()
      );
    }

    if (aSlot && !bSlot) return -1;
    if (!aSlot && bSlot) return 1;

    return (
      new Date(b.created_at || "").getTime() -
      new Date(a.created_at || "").getTime()
    );
  });

  return (
    <div className="min-h-screen bg-gray-50 px-6 py-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Meeting Requests</h1>

          <p className="mt-2 text-sm text-gray-600">
            등록된 미팅 요청을 확인하고 상태를 변경할 수 있어요.
          </p>
          {filterDescription && (
            <p className="mt-2 text-sm font-medium text-blue-800">{filterDescription}</p>
          )}
        </div>

        <div className="mb-6 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => handleFilterChange(null)}
            className={`rounded-xl px-4 py-2 text-sm font-medium ${
              !status
                ? "bg-gray-900 text-white ring-2 ring-gray-300 shadow-sm"
                : "bg-gray-200 text-gray-800 hover:bg-gray-300"
            }`}
          >
            전체
          </button>

          <button
            type="button"
            onClick={() => handleFilterChange("confirmed")}
            className={`rounded-xl px-4 py-2 text-sm font-medium ${
              status === "confirmed"
                ? "bg-green-600 text-white ring-2 ring-green-300 shadow-sm"
                : "bg-green-100 text-green-800 hover:bg-green-200"
            }`}
          >
            확정
          </button>

          <button
            type="button"
            onClick={() => handleFilterChange("rejected")}
            className={`rounded-xl px-4 py-2 text-sm font-medium ${
              status === "rejected"
                ? "bg-red-600 text-white ring-2 ring-red-300 shadow-sm"
                : "bg-red-100 text-red-800 hover:bg-red-200"
            }`}
          >
            보류
          </button>

          <button
            type="button"
            onClick={() => handleFilterChange("reviewing")}
            className={`rounded-xl px-4 py-2 text-sm font-medium ${
              status === "reviewing"
                ? "bg-yellow-500 text-white ring-2 ring-yellow-300 shadow-sm"
                : "bg-yellow-100 text-yellow-800 hover:bg-yellow-200"
            }`}
          >
            검토중
          </button>

          <button
            type="button"
            onClick={() => handleFilterChange("slot_checking")}
            className={`rounded-xl px-4 py-2 text-sm font-medium ${
              status === "slot_checking"
                ? "bg-blue-600 text-white ring-2 ring-blue-300 shadow-sm"
                : "bg-blue-100 text-blue-800 hover:bg-blue-200"
            }`}
          >
            슬롯 확인중
          </button>

          <button
            type="button"
            onClick={() => handleFilterChange("preparing")}
            className={`rounded-xl px-4 py-2 text-sm font-medium ${
              status === "preparing"
                ? "bg-purple-600 text-white ring-2 ring-purple-300 shadow-sm"
                : "bg-purple-100 text-purple-800 hover:bg-purple-200"
            }`}
          >
            실행 준비중
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
        ) : filteredRequests.length === 0 ? (
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <p className="text-sm text-gray-600">
              {requests.length === 0
                ? "등록된 미팅 요청이 아직 없어요."
                : "이 조건에 맞는 미팅 요청이 없어요."}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredRequests.map((request) => {
              const isUpdating = updatingId === request.id;
              const actions = getActionButtons(request.status);
              const checklistProgress = checklistProgressMap[String(request.id)] ?? {
                completed: false,
                completedCount: 0,
              };
              const checklistCompleted = checklistProgress.completed;
              const selectedSlot = selectedSlotMap[String(request.id)] || null;
              const canConfirm = canConfirmRequest(selectedSlot);
const riskType = getRiskType({
  status: request.status,
  urgency_level: request.urgency_level,
  slot: selectedSlot,
  checklistCompletedCount: checklistProgress.completedCount,
});
              const warningMessage = getWarningMessage({
                riskType,
                selectedSlot,
                checklistCompletedCount: checklistProgress.completedCount,
              });

              return (
                <div
                  key={String(request.id)}
                  className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100"
                >
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="flex-1">
                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-semibold text-gray-900">
                          {request.title}
                        </h2>
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-medium ${getStatusBadgeColor(
                            request.status
                          )}`}
                        >
                          {getStatusLabel(request.status)}
                        </span>

                        <RiskBadge riskType={riskType} />

                        {selectedSlot && isTodayDateTime(selectedSlot.start_datetime) && (
                          <span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-medium text-orange-700">
                            오늘 일정
                          </span>
                        )}
                      </div>

                      {warningMessage && (
                        <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                          {warningMessage}
                        </div>
                      )}

                      <div className="grid gap-2 text-sm text-gray-700">
                        <p>
                          <span className="font-medium">요청자:</span>{" "}
                          {request.requester_name || "-"}
                        </p>
                        <p>
                          <span className="font-medium">목적:</span>{" "}
                          {request.purpose || "-"}
                        </p>
                        <p>
                          <span className="font-medium">참석자:</span>{" "}
                          {getParticipantsDisplayText(request.participants_text)}
                        </p>
                        <p>
                          <span className="font-medium">희망 시기:</span>{" "}
                          {request.preferred_date_range || "-"}
                        </p>
                        <p>
                          <span className="font-medium">확정 시간:</span>{" "}
                          {selectedSlot ? (
                            <span className="font-semibold text-blue-700">
                              {formatSlotRange(
                                selectedSlot.start_datetime,
                                selectedSlot.end_datetime
                              )}
                            </span>
                          ) : (
                            "-"
                          )}
                        </p>
                        <p>
                          <span className="font-medium">소요 시간:</span>{" "}
                          {formatDuration(request.duration_minutes)}
                        </p>
                        <p>
                          <span className="font-medium">체크리스트 완료도:</span>{" "}
                          {checklistProgress.completedCount}/6
                        </p>
                        <p>
                          <span className="font-medium">중요도:</span>{" "}
                          {request.importance_level || "-"}
                        </p>
                        <p>
                          <span className="font-medium">긴급도:</span>{" "}
                          {request.urgency_level || "-"}
                        </p>
                        <p>
                          <span className="font-medium">외부 참석:</span>{" "}
                          {request.external_flag ? "예" : "아니오"}
                        </p>
                        <p>
                          <span className="font-medium">메모:</span>{" "}
                          {getPrimaryPlanningNotes(request)}
                        </p>
                        <p className="text-xs text-gray-500">
                          생성일: {formatDate(request.created_at)}
                        </p>
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          router.push(`/meeting-requests/${request.id}`);
                        }}
                        className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50"
                      >
                        상세보기
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteRequest(request.id)}
                        disabled={isUpdating}
                        className="rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-300"
                      >
                        {isUpdating ? "처리중..." : "삭제"}
                      </button>

                      {["confirmed", "preparing"].includes(request.status || "") && (
                        <button
                          type="button"
                          onClick={() => {
                            router.push(
                              `/execution-checklists?requestId=${request.id}`
                            );
                          }}
                          className="rounded-xl bg-gray-800 px-4 py-2 text-sm font-medium text-white hover:bg-gray-900"
                        >
                          체크리스트 확인
                        </button>
                      )}

                      {actions.map((action) => {
                        const isDoneAction = action.nextStatus === "done";
                        const isConfirmAction = action.nextStatus === "confirmed";

                        const isDisabled =
                          isUpdating ||
                          (isDoneAction && !checklistCompleted) ||
                          (isConfirmAction && !canConfirm);

                        return (
                          <button
                            key={action.label}
                            type="button"
                            onClick={() => handleStatusUpdate(request.id, action.nextStatus)}
                            disabled={isDisabled}
                            title={
                              isDoneAction && !checklistCompleted
                                ? "체크리스트를 모두 완료해야 완료 처리할 수 있어요."
                                : isConfirmAction && !canConfirm
                                ? "확정된 슬롯이 있어야 일정 확정이 가능해요."
                                : undefined
                            }
                            className={getActionButtonClass(action.style)}
                          >
                            {isUpdating ? "처리중..." : action.label}
                          </button>
                        );
                      })}
                    </div>
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

export default function MeetingRequestsPage() {
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
      <MeetingRequestsContent />
    </Suspense>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import SlotCandidatesSection from "@/components/slot-candidates-section";
import RiskBadge from "@/components/RiskBadge";
import {
  canConfirmRequest,
  canCompleteRequest,
  getChecklistCompletedCount,
  getDetailWarningMessage,
  confirmAction,
} from "@/lib/uiRules";
import { getRiskType } from "@/lib/risk";
import { syncMeetingRequestStatusByChecklist } from "@/lib/checklist-status";
import { deleteMeetingRequestWithRelations } from "@/lib/delete-meeting-request";
import {
  buildParticipantsStorageValueFromEmailMap,
  getParticipantNameKey,
  getParticipantEmailsList,
  getParticipantsDisplayText,
  normalizeParticipantName,
  parseParticipants,
  parseParticipantNamesText,
} from "@/lib/participants";
import toast from "react-hot-toast";

type MeetingRequest = {
  id: string | number;
  title: string;
  purpose: string | null;
  requester_name: string | null;
  participants_text: string | null;
  external_flag: boolean | null;
  preferred_date_range: string | null;
  duration_minutes: number | null;
  importance_level: string | null;
  urgency_level: string | null;
  planning_notes: string | null;
  background_notes: string | null;
  executive_required_flag: boolean | null;
  status: string | null;
  notes: string | null;
  importance?: string | null;
  urgency?: string | null;
  memo?: string | null;
  created_at: string | null;
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

type SelectedSlot = {
  id: string;
  start_datetime: string;
  end_datetime: string;
  proposed_by: string | null;
  note: string | null;
};

type GeneratedSlot = {
  id: string;
  start_datetime: string;
  end_datetime: string;
  reasons: string[];
  window_start: string;
  window_end: string;
};

type AvailabilityItem = {
  email: string;
  busy: Array<{
    start: string;
    end: string;
  }>;
  isFree: boolean;
};

type AvailabilityLookupSummary = {
  resolvedEmails: string[];
  autoMapped: Array<{
    name: string;
    email: string;
  }>;
  failed: string[];
  ambiguous: string[];
};

type ParticipantSearchResult = {
  name: string;
  email: string;
  organization: string | null;
};

type ParticipantEmailMap = Record<string, string>;

type MeetingRequestEditForm = {
  title: string;
  purpose: string;
  requester_name: string;
  participants_text: string;
  external_flag: boolean;
  preferred_date_range: string;
  importance_level: string;
  urgency_level: string;
  planning_notes: string;
  background_notes: string;
};

const CHECKLIST_FIELDS = [
  "invite_sent",
  "venue_confirmed",
  "access_registered",
  "parking_registered",
  "equipment_checked",
  "attendee_finalized",
] as const;

const CHECKLIST_LABELS: Record<(typeof CHECKLIST_FIELDS)[number], string> = {
  invite_sent: "인비 발송",
  venue_confirmed: "장소 확정",
  access_registered: "출입 등록",
  parking_registered: "주차 등록",
  equipment_checked: "장비 확인",
  attendee_finalized: "참석자 최종 확정",
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

function buildParticipantEmailMap(value: unknown) {
  return parseParticipants(value).reduce<ParticipantEmailMap>((acc, participant) => {
    const nameKey = getParticipantNameKey(participant.name);
    const email = participant.email?.trim().toLowerCase();

    if (nameKey && email) {
      acc[nameKey] = email;
    }

    return acc;
  }, {});
}

function parsePreferredDateRange(value: string | null) {
  if (!value) return null;

  const matches = value.match(/\d{4}-\d{2}-\d{2}/g);
  if (!matches || matches.length === 0) return null;

  const start = new Date(`${matches[0]}T00:00:00`);
  const end = new Date(`${matches[matches.length - 1]}T00:00:00`);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null;
  }

  return start <= end ? { start, end } : { start: end, end: start };
}

function isSlotBusy(
  slotStart: string,
  slotEnd: string,
  busyStart: string,
  busyEnd: string
) {
  const slotStartTime = new Date(slotStart).getTime();
  const slotEndTime = new Date(slotEnd).getTime();
  const busyStartTime = new Date(busyStart).getTime();
  const busyEndTime = new Date(busyEnd).getTime();

  return slotStartTime < busyEndTime && slotEndTime > busyStartTime;
}

function isCommonAvailableForSlot(
  startDatetime: string,
  endDatetime: string,
  availabilityItems: AvailabilityItem[]
) {
  if (availabilityItems.length === 0) return false;

  return availabilityItems.every((item) =>
    item.busy.every(
      (busy) =>
        !isSlotBusy(
          startDatetime,
          endDatetime,
          busy.start,
          busy.end
        )
    )
  );
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function getGeneratedSlotPriority(start: Date, end: Date) {
  const startMinutes = start.getHours() * 60 + start.getMinutes();
  const endMinutes = end.getHours() * 60 + end.getMinutes();

  if (startMinutes >= 9 * 60 && endMinutes <= 18 * 60) {
    return 0;
  }

  if (startMinutes < 9 * 60) {
    return 1;
  }

  return 2;
}

function getLunchPenalty(start: Date, end: Date) {
  const startMinutes = start.getHours() * 60 + start.getMinutes();
  const endMinutes = end.getHours() * 60 + end.getMinutes();
  const lunchStart = 11 * 60 + 30;
  const lunchEnd = 13 * 60 + 30;

  if (startMinutes === lunchStart) return 3;
  if (startMinutes < lunchEnd && endMinutes > lunchStart) return 2;
  return 0;
}

function formatTimeRangeLabel(start: string, end: string) {
  const startDate = new Date(start);
  const endDate = new Date(end);

  const formatPart = (date: Date) =>
    `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;

  return `${formatPart(startDate)}~${formatPart(endDate)}`;
}

type InternalGeneratedSlot = {
  start_datetime: string;
  end_datetime: string;
  priority: number;
  lunchPenalty: number;
  isOnTheHour: boolean;
};

type GeneratedSlotWindow = {
  window_start: string;
  window_end: string;
  candidates: InternalGeneratedSlot[];
};

function groupGeneratedSlotsByWindow(slots: InternalGeneratedSlot[]) {
  if (slots.length === 0) return [];

  const sorted = [...slots].sort(
    (a, b) =>
      new Date(a.start_datetime).getTime() - new Date(b.start_datetime).getTime()
  );

  const groups: GeneratedSlotWindow[] = [];

  sorted.forEach((slot) => {
    const lastGroup = groups[groups.length - 1];

    if (!lastGroup) {
      groups.push({
        window_start: slot.start_datetime,
        window_end: slot.end_datetime,
        candidates: [slot],
      });
      return;
    }

    const sameDay =
      new Date(lastGroup.window_start).toDateString() ===
      new Date(slot.start_datetime).toDateString();
    const overlaps =
      new Date(slot.start_datetime).getTime() < new Date(lastGroup.window_end).getTime();

    if (sameDay && overlaps) {
      lastGroup.window_end =
        new Date(slot.end_datetime).getTime() > new Date(lastGroup.window_end).getTime()
          ? slot.end_datetime
          : lastGroup.window_end;
      lastGroup.candidates.push(slot);
      return;
    }

    groups.push({
      window_start: slot.start_datetime,
      window_end: slot.end_datetime,
      candidates: [slot],
    });
  });

  return groups;
}

function generateRecommendedSlots({
  preferredRange,
  durationMinutes,
  availabilityItems,
  limit = 3,
}: {
  preferredRange: string | null;
  durationMinutes: number | null;
  availabilityItems: AvailabilityItem[];
  limit?: number;
}): GeneratedSlot[] {
  const parsedRange = parsePreferredDateRange(preferredRange);

  if (!parsedRange || !durationMinutes || durationMinutes <= 0 || availabilityItems.length === 0) {
    return [];
  }

  const generatedSlots: InternalGeneratedSlot[] = [];

  for (
    let currentDate = new Date(parsedRange.start);
    currentDate.getTime() <= parsedRange.end.getTime();
    currentDate = addDays(currentDate, 1)
  ) {
    const day = currentDate.getDay();
    if (day === 0 || day === 6) continue;

    for (let hour = 7; hour < 20; hour += 1) {
      for (let minute = 0; minute < 60; minute += 30) {
        const start = new Date(
          currentDate.getFullYear(),
          currentDate.getMonth(),
          currentDate.getDate(),
          hour,
          minute,
          0,
          0
        );
        const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
        const dayEnd = new Date(
          currentDate.getFullYear(),
          currentDate.getMonth(),
          currentDate.getDate(),
          20,
          0,
          0,
          0
        );

        if (end.getTime() > dayEnd.getTime()) {
          continue;
        }

        const startDatetime = start.toISOString();
        const endDatetime = end.toISOString();

        if (!isCommonAvailableForSlot(startDatetime, endDatetime, availabilityItems)) {
          continue;
        }

        generatedSlots.push({
          start_datetime: startDatetime,
          end_datetime: endDatetime,
          priority: getGeneratedSlotPriority(start, end),
          lunchPenalty: getLunchPenalty(start, end),
          isOnTheHour: start.getMinutes() === 0,
        });
      }
    }
  }

  return groupGeneratedSlotsByWindow(generatedSlots)
    .map((group) => {
      const representative = [...group.candidates].sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        if (a.lunchPenalty !== b.lunchPenalty) return a.lunchPenalty - b.lunchPenalty;
        if (a.isOnTheHour !== b.isOnTheHour) return a.isOnTheHour ? -1 : 1;
        return (
          new Date(a.start_datetime).getTime() - new Date(b.start_datetime).getTime()
        );
      })[0];

      return {
        id: `${group.window_start}-${group.window_end}`,
        start_datetime: representative.start_datetime,
        end_datetime: representative.end_datetime,
        window_start: group.window_start,
        window_end: group.window_end,
        reasons: [
          "전원 공통 가능",
          "희망 시기 범위 내",
          "주간 핵심 운영 시간대",
          "가까운 날짜 우선",
        ],
      };
    })
    .sort((a, b) => {
      const aPriority = getGeneratedSlotPriority(
        new Date(a.start_datetime),
        new Date(a.end_datetime)
      );
      const bPriority = getGeneratedSlotPriority(
        new Date(b.start_datetime),
        new Date(b.end_datetime)
      );

      if (aPriority !== bPriority) return aPriority - bPriority;
      return (
        new Date(a.start_datetime).getTime() - new Date(b.start_datetime).getTime()
      );
    })
    .slice(0, limit)
}

export default function MeetingRequestDetailPage() {
  const router = useRouter();
  const params = useParams();
  const requestId = params?.id as string;

  const [request, setRequest] = useState<MeetingRequest | null>(null);
  const [checklist, setChecklist] = useState<ExecutionChecklist | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<SelectedSlot | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [availabilityItems, setAvailabilityItems] = useState<AvailabilityItem[]>([]);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilityError, setAvailabilityError] = useState("");
  const [availabilityLookupSummary, setAvailabilityLookupSummary] =
    useState<AvailabilityLookupSummary | null>(null);
  const [participantQuery, setParticipantQuery] = useState("");
  const [participantSearchLoading, setParticipantSearchLoading] = useState(false);
  const [participantSearchError, setParticipantSearchError] = useState("");
  const [participantSearchEmpty, setParticipantSearchEmpty] = useState(false);
  const [participantEmailMap, setParticipantEmailMap] = useState<ParticipantEmailMap>(
    {}
  );
  const [participantCandidates, setParticipantCandidates] = useState<
    ParticipantSearchResult[]
  >([]);
  const [editForm, setEditForm] = useState<MeetingRequestEditForm>({
    title: "",
    purpose: "",
    requester_name: "",
    participants_text: "",
    external_flag: false,
    preferred_date_range: "",
    importance_level: "",
    urgency_level: "",
    planning_notes: "",
    background_notes: "",
  });
  const [onsiteOwnerInput, setOnsiteOwnerInput] = useState("");
  const [roomInfoInput, setRoomInfoInput] = useState("");
  const [specialNotesInput, setSpecialNotesInput] = useState("");

  const buildEditFormFromRequest = useCallback((item: MeetingRequest) => {
    const displayParticipants =
      getParticipantsDisplayText(item.participants_text) === "-"
        ? ""
        : getParticipantsDisplayText(item.participants_text);

    return {
      title: item.title || "",
      purpose: item.purpose || "",
      requester_name: item.requester_name || "",
      participants_text: displayParticipants,
      external_flag: Boolean(item.external_flag),
      preferred_date_range: item.preferred_date_range || "",
      importance_level: item.importance_level || "",
      urgency_level: item.urgency_level || "",
      planning_notes: item.planning_notes || "",
      background_notes: item.background_notes || "",
    };
  }, []);

  const fetchDetail = useCallback(async () => {
    if (!requestId) return;

    setLoading(true);
    setErrorMessage("");

    const { data: requestData, error: requestError } = await supabase
      .from("meeting_requests")
      .select("*")
      .eq("id", requestId)
      .single();

    if (requestError) {
      console.error("미팅 요청 상세 조회 에러:", JSON.stringify(requestError, null, 2));
      setErrorMessage(`미팅 요청을 불러오지 못했어요. (${requestError.message})`);
      setLoading(false);
      return;
    }

    const { data: checklistData, error: checklistError } = await supabase
      .from("execution_checklists")
      .select("*")
      .eq("meeting_request_id", requestId)
      .maybeSingle();

    if (checklistError) {
      console.error("체크리스트 조회 에러:", checklistError);
      setErrorMessage(`체크리스트를 불러오지 못했어요. (${checklistError.message})`);
      setLoading(false);
      return;
    }

    const { data: selectedSlotData, error: selectedSlotError } = await supabase
      .from("meeting_slot_candidates")
      .select("id, start_datetime, end_datetime, proposed_by, note")
      .eq("meeting_request_id", requestId)
      .eq("is_selected", true)
      .maybeSingle();

    if (selectedSlotError) {
      console.error("확정 슬롯 조회 에러:", selectedSlotError);
      setErrorMessage(`확정 슬롯을 불러오지 못했어요. (${selectedSlotError.message})`);
      setLoading(false);
      return;
    }

    const parsedChecklist = (checklistData as ExecutionChecklist) || null;
    const normalizedRequest = normalizeMeetingRequest(requestData as MeetingRequest);

    setRequest(normalizedRequest);
    setChecklist(parsedChecklist);
    setSelectedSlot((selectedSlotData as SelectedSlot) || null);
    setEditForm(buildEditFormFromRequest(normalizedRequest));
    setParticipantEmailMap(buildParticipantEmailMap(normalizedRequest.participants_text));
    setAvailabilityLookupSummary(null);
    setOnsiteOwnerInput(parsedChecklist?.onsite_owner || "");
    setRoomInfoInput(parsedChecklist?.room_info || "");
    setSpecialNotesInput(parsedChecklist?.special_notes || "");
    setLoading(false);
  }, [buildEditFormFromRequest, requestId]);

  useEffect(() => {
    void fetchDetail();
  }, [fetchDetail]);

  const generatedRecommendedSlots = useMemo(() => {
    return generateRecommendedSlots({
      preferredRange: request?.preferred_date_range || null,
      durationMinutes: request?.duration_minutes || null,
      availabilityItems,
      limit: 3,
    });
  }, [availabilityItems, request?.duration_minutes, request?.preferred_date_range]);

  async function createChecklistIfNeeded(meetingRequestId: string | number) {
    const { data: existingChecklist, error: checkError } = await supabase
      .from("execution_checklists")
      .select("id")
      .eq("meeting_request_id", meetingRequestId)
      .maybeSingle();

    if (checkError) {
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
      throw new Error(`체크리스트 생성 실패: ${insertError.message}`);
    }
  }

  async function handleStatusUpdate(newStatus: string) {
    if (!request) return;

    const { data: freshSelectedSlot, error: selectedSlotCheckError } = await supabase
      .from("meeting_slot_candidates")
      .select("id")
      .eq("meeting_request_id", requestId)
      .eq("is_selected", true)
      .maybeSingle();

    if (selectedSlotCheckError) {
      console.error("확정 슬롯 확인 에러:", selectedSlotCheckError);
      setErrorMessage(`확정 슬롯 확인 실패: ${selectedSlotCheckError.message}`);
      return;
    }

    if (newStatus === "confirmed" && !freshSelectedSlot) {
      setErrorMessage("확정된 시간(슬롯)이 있어야 일정 확정이 가능해요.");
      return;
    }

    if (newStatus === "confirmed" && !confirmAction("이 요청을 확정 상태로 변경할까요?")) {
      return;
    }

    setUpdating(true);
    setErrorMessage("");

    if (newStatus === "done") {
      if (!checklist) {
        setErrorMessage("체크리스트가 없어서 완료 처리할 수 없어요.");
        setUpdating(false);
        return;
      }

      if (!canCompleteRequest(checklist)) {
        setErrorMessage("체크리스트가 아직 모두 완료되지 않았어요.");
        setUpdating(false);
        return;
      }

      if (!confirmAction("모든 준비가 완료되었습니다. 완료 처리할까요?")) {
        setUpdating(false);
        return;
      }
    }

    if (newStatus === "rejected" && !confirmAction("이 요청을 보류 상태로 변경할까요?")) {
      return;
    }

    const { data: updatedRows, error: updateError } = await supabase
      .from("meeting_requests")
      .update({ status: newStatus })
      .eq("id", request.id)
      .select();

    if (updateError) {
      console.error("상태 변경 에러:", updateError);
      setErrorMessage(`상태 변경 실패: ${updateError.message}`);
      setUpdating(false);
      return;
    }

    if (!updatedRows || updatedRows.length === 0) {
      setErrorMessage("상태가 바뀌지 않았어요.");
      setUpdating(false);
      return;
    }

    if (newStatus === "confirmed") {
      try {
        await createChecklistIfNeeded(request.id);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "체크리스트 생성 중 오류가 발생했어요.";
        setErrorMessage(message);
      }
    }

    await fetchDetail();

    if (newStatus === "slot_checking") {
      try {
        await handleCheckAvailability();
      } catch (error) {
        console.error(error);
      }
    }

    setUpdating(false);
  }

  async function handleChecklistToggle(
    field: (typeof CHECKLIST_FIELDS)[number]
  ) {
    if (!checklist || !request) return;

    setUpdating(true);
    setErrorMessage("");

    const previousValue = checklist[field];
    const nextValue = !previousValue;

    const nextChecklist = {
      ...checklist,
      [field]: nextValue,
    };

    setChecklist(nextChecklist);

    const { error } = await supabase
      .from("execution_checklists")
      .update({
        [field]: nextValue,
      })
      .eq("id", checklist.id);

    if (error) {
      console.error("체크리스트 업데이트 에러:", error);
      setChecklist({
        ...checklist,
        [field]: previousValue,
      });
      setErrorMessage(`체크리스트 저장 실패: ${error.message}`);
      setUpdating(false);
      return;
    }

    try {
      await syncMeetingRequestStatusByChecklist({
        supabase,
        meetingRequestId: request.id,
        currentStatus: request.status,
        checklist: nextChecklist,
      });
      await fetchDetail();
    } catch (error) {
      console.error(error);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "상태 자동 변경 중 오류가 발생했어요."
      );
    }

    setUpdating(false);
  }

  async function handleChecklistTextSave() {
    if (!checklist) return;

    setUpdating(true);
    setErrorMessage("");

    const nextValues = {
      onsite_owner: onsiteOwnerInput.trim() || null,
      room_info: roomInfoInput.trim() || null,
      special_notes: specialNotesInput.trim() || null,
    };

    setChecklist({
      ...checklist,
      ...nextValues,
    });

    const { error } = await supabase
      .from("execution_checklists")
      .update(nextValues)
      .eq("id", checklist.id);

    if (error) {
      console.error("체크리스트 텍스트 저장 에러:", error);
      setErrorMessage(`체크리스트 저장 실패: ${error.message}`);
      setUpdating(false);
      return;
    }

    setUpdating(false);
    toast.success("체크리스트 텍스트를 저장했어요.");
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

  function getStatusBadgeClass(status: string | null) {
    switch (status) {
      case "confirmed":
        return "bg-green-100 text-green-700";
      case "reviewing":
        return "bg-yellow-100 text-yellow-700";
      case "slot_checking":
        return "bg-blue-100 text-blue-700";
      case "rejected":
        return "bg-red-100 text-red-700";
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
          { label: "슬롯 확인", nextStatus: "slot_checking", style: "secondary" },
          { label: "보류", nextStatus: "rejected", style: "danger" },
        ];
      case "reviewing":
        return [
          { label: "슬롯 확인", nextStatus: "slot_checking", style: "secondary" },
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
          { label: "실행 준비", nextStatus: "preparing", style: "secondary" },
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
          { label: "슬롯 확인", nextStatus: "slot_checking", style: "secondary" },
          { label: "보류", nextStatus: "rejected", style: "danger" },
        ];
    }
  }

  function getActionButtonClass(style: "primary" | "secondary" | "danger") {
    switch (style) {
      case "primary":
        return "rounded-xl bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-green-300";
      case "secondary":
        return "rounded-xl bg-gray-200 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-300 disabled:cursor-not-allowed disabled:bg-gray-100";
      case "danger":
        return "rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-300";
      default:
        return "rounded-xl bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700";
    }
  }

  function formatDate(value: string | null) {
    if (!value) return "-";
    try {
      return new Date(value).toLocaleString("ko-KR");
    } catch {
      return value;
    }
  }

  function formatDuration(minutes: number | null) {
    if (!minutes) return "-";
    if (minutes === 30) return "30분";
    if (minutes % 60 === 0) return `${minutes / 60}시간`;
    return `${Math.floor(minutes / 60)}시간 ${minutes % 60}분`;
  }

  function formatDateTimeForCalendar(value: string | null) {
    if (!value) return "-";

    try {
      return new Date(value).toLocaleString("ko-KR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return value;
    }
  }

  function getParticipantsDisplay() {
    return getParticipantsDisplayText(request?.participants_text);
  }

  function getParticipantEmails() {
    return getParticipantEmailsList(request?.participants_text);
  }

  async function resolveParticipantEmailsForAvailability() {
    const participants = parseParticipants(request?.participants_text);
    const resolvedEmails = new Set<string>();
    const autoMapped: AvailabilityLookupSummary["autoMapped"] = [];
    const failed: string[] = [];
    const ambiguous: string[] = [];
    const unresolvedNames = participants
      .filter((participant) => !participant.email && normalizeParticipantName(participant.name))
      .map((participant) => normalizeParticipantName(participant.name))
      .filter((name, index, array) => array.indexOf(name) === index);

    participants.forEach((participant) => {
      const email = participant.email?.trim().toLowerCase();
      if (email) {
        resolvedEmails.add(email);
      }
    });

    const lookupResults = await Promise.all(
      unresolvedNames.map(async (name) => {
        try {
          const response = await fetch(
            `/api/google-people/search?query=${encodeURIComponent(name)}`
          );
          const result = (await response.json()) as {
            error?: string;
            results?: ParticipantSearchResult[];
          };

          if (!response.ok) {
            throw new Error(result.error || "참가자 이메일 검색에 실패했어요.");
          }

          return {
            name,
            results: result.results || [],
          };
        } catch (error) {
          return {
            name,
            error:
              error instanceof Error
                ? error.message
                : "참가자 이메일 검색 중 오류가 발생했어요.",
            results: [] as ParticipantSearchResult[],
          };
        }
      })
    );

    lookupResults.forEach((lookup) => {
      if ("error" in lookup && lookup.error) {
        failed.push(lookup.name);
        return;
      }

      if (lookup.results.length === 1) {
        const matched = lookup.results[0];
        const email = matched.email.trim().toLowerCase();
        resolvedEmails.add(email);
        autoMapped.push({
          name: lookup.name,
          email,
        });
        return;
      }

      if (lookup.results.length === 0) {
        failed.push(lookup.name);
        return;
      }

      ambiguous.push(lookup.name);
    });

    return {
      resolvedEmails: Array.from(resolvedEmails),
      autoMapped,
      failed,
      ambiguous,
    };
  }

  function buildCalendarTitle() {
    if (!request) return "";
    return request.title?.trim() || "미팅";
  }

  function buildCalendarDescription() {
    return `참석자: ${getParticipantsDisplay()}`;
  }

  function buildCalendarCopyMessage() {
    if (!request) return "";

    const requester = request.requester_name?.trim() || "요청자";
    const title = buildCalendarTitle();
    const location = checklist?.room_info?.trim() || "-";
    const participants = getParticipantsDisplay();

    return `${requester} 요청으로 아래 일정 새로 잡아 드렸습니다.

${title}
- ${location}
- ${participants}`;
  }

  async function handleCopyCalendarMessage() {
    try {
      await navigator.clipboard.writeText(buildCalendarCopyMessage());
      toast.success("안내 문구를 복사했어요.");
    } catch {
      toast.error("복사에 실패했어요.");
    }
  }

  function buildAttendeeEmailsCopyText() {
    const participants = parseParticipants(request?.participants_text);

    return participants
      .filter((p) => p.email)
      .map((p) => `${p.name} <${p.email}>`)
      .join(", ");
  }

  async function handleCopyAttendeeEmails() {
    try {
      await navigator.clipboard.writeText(buildAttendeeEmailsCopyText());
      toast.success("참석자 이메일을 복사했어요.");
    } catch {
      toast.error("참석자 이메일 복사에 실패했어요.");
    }
  }

  function formatGoogleCalendarDate(value: string) {
    const date = new Date(value);
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const day = String(date.getUTCDate()).padStart(2, "0");
    const hours = String(date.getUTCHours()).padStart(2, "0");
    const minutes = String(date.getUTCMinutes()).padStart(2, "0");
    const seconds = String(date.getUTCSeconds()).padStart(2, "0");

    return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
  }

  function buildGoogleCalendarUrl() {
    if (!request || !selectedSlot) return "#";

    const baseUrl =
      "https://calendar.google.com/calendar/render?action=TEMPLATE";

    const text = encodeURIComponent(buildCalendarTitle());
    const details = encodeURIComponent(buildCalendarDescription());
    const dates = `${formatGoogleCalendarDate(
      selectedSlot.start_datetime
    )}/${formatGoogleCalendarDate(selectedSlot.end_datetime)}`;
    const location = encodeURIComponent(checklist?.room_info?.trim() || "");

    return `${baseUrl}&text=${text}&dates=${dates}&details=${details}&location=${location}`;
  }

  async function markInviteSentFromCalendarAction() {
    if (!request) return;

    await createChecklistIfNeeded(request.id);

    const { error } = await supabase
      .from("execution_checklists")
      .update({ invite_sent: true })
      .eq("meeting_request_id", request.id);

    if (error) {
      throw new Error(`인비 발송 체크 반영 실패: ${error.message}`);
    }

    await syncMeetingRequestStatusByChecklist({
      supabase,
      meetingRequestId: request.id,
      currentStatus: request.status,
      checklist: {
        invite_sent: true,
        venue_confirmed: checklist?.venue_confirmed ?? false,
        access_registered: checklist?.access_registered ?? false,
        parking_registered: checklist?.parking_registered ?? false,
        equipment_checked: checklist?.equipment_checked ?? false,
        attendee_finalized: checklist?.attendee_finalized ?? false,
      },
    });

    await fetchDetail();
  }

  function buildCalendarEventPayload() {
    if (!request || !selectedSlot) return null;

    return {
      summary: buildCalendarTitle(),
      description: buildCalendarDescription(),
      start: {
        dateTime: new Date(selectedSlot.start_datetime).toISOString(),
        timeZone: "Asia/Seoul",
      },
      end: {
        dateTime: new Date(selectedSlot.end_datetime).toISOString(),
        timeZone: "Asia/Seoul",
      },
      location: checklist?.room_info?.trim() || "",
      attendees: [],
    };
  }

  async function handleCreateCalendarEventViaApi() {
    const payload = buildCalendarEventPayload();

    if (!payload) {
      alert("캘린더 이벤트 payload를 만들 수 없어요.");
      return;
    }

    try {
      const response = await fetch("/api/google-calendar/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.error || "캘린더 이벤트 생성 실패");
      }

      console.log("calendar api result:", result);
      alert("API route 호출 성공! 이제 실제 Google 연동만 붙이면 돼요.");
    } catch (error) {
      console.error(error);
      alert(
        error instanceof Error
          ? error.message
          : "API route 호출 중 오류가 발생했어요."
      );
    }
  }

  async function handleOpenGoogleCalendar() {
    if (!selectedSlot) {
      toast.error("확정된 슬롯이 없어서 캘린더 이벤트를 만들 수 없어요.");
      return;
    }

    try {
      window.open(buildGoogleCalendarUrl(), "_blank", "noopener,noreferrer");
      await markInviteSentFromCalendarAction();
      alert("Google Calendar를 열고, 체크리스트의 '인비 발송'을 완료로 반영했어요.");
    } catch (error) {
      console.error(error);
      alert(
        error instanceof Error
          ? error.message
          : "인비 발송 상태 반영 중 오류가 발생했어요."
      );
    }
  }

  async function handleCheckAvailability() {
    const parsedRange = parsePreferredDateRange(request?.preferred_date_range || null);

    if (!parsedRange) {
      setAvailabilityError("희망 시기를 먼저 설정해야 availability를 조회할 수 있어요.");
      setAvailabilityItems([]);
      return;
    }

    const timeMin = new Date(
      parsedRange.start.getFullYear(),
      parsedRange.start.getMonth(),
      parsedRange.start.getDate(),
      7,
      0,
      0,
      0
    ).toISOString();
    const timeMax = new Date(
      parsedRange.end.getFullYear(),
      parsedRange.end.getMonth(),
      parsedRange.end.getDate(),
      20,
      0,
      0,
      0
    ).toISOString();

    setAvailabilityLoading(true);
    setAvailabilityError("");
    setAvailabilityLookupSummary(null);

    try {
      const lookupSummary = await resolveParticipantEmailsForAvailability();
      const participantEmails = lookupSummary.resolvedEmails;

      if (participantEmails.length === 0) {
        setAvailabilityItems([]);
        setAvailabilityLookupSummary(lookupSummary);
        setAvailabilityError(
          "사용 가능한 참석자 이메일을 찾지 못해서 availability를 조회할 수 없어요."
        );
        return;
      }

      const response = await fetch("/api/google-calendar/freebusy", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          timeMin,
          timeMax,
          timeZone: "Asia/Seoul",
          attendeeEmails: participantEmails,
        }),
      });

      const result = (await response.json()) as {
        error?: string;
        attendees?: AvailabilityItem[];
      };

      if (!response.ok) {
        throw new Error(result.error || "availability 조회 실패");
      }

      const nextAvailabilityItems = result.attendees || [];
      setAvailabilityItems(nextAvailabilityItems);
      setAvailabilityLookupSummary(lookupSummary);
      toast.success("희망 시기 범위 기준 availability를 불러왔어요.");
    } catch (error) {
      console.error(error);
      setAvailabilityItems([]);
      setAvailabilityError(
        error instanceof Error
          ? error.message
          : "availability 조회 중 오류가 발생했어요."
      );
    } finally {
      setAvailabilityLoading(false);
    }
  }

  async function handleConfirmGeneratedSlot(slot: GeneratedSlot) {
    if (!request) return;

    if (!confirmAction("이 시간으로 확정할까요?")) {
      return;
    }

    setUpdating(true);
    setErrorMessage("");

    try {
      const { error: clearError } = await supabase
        .from("meeting_slot_candidates")
        .update({ is_selected: false })
        .eq("meeting_request_id", request.id);

      if (clearError) {
        throw new Error(`기존 선택 슬롯 해제 실패: ${clearError.message}`);
      }

      const { data: existingSlot, error: existingSlotError } = await supabase
        .from("meeting_slot_candidates")
        .select("id")
        .eq("meeting_request_id", request.id)
        .eq("start_datetime", slot.start_datetime)
        .eq("end_datetime", slot.end_datetime)
        .maybeSingle();

      if (existingSlotError) {
        throw new Error(`기존 자동 생성 슬롯 확인 실패: ${existingSlotError.message}`);
      }

      if (existingSlot?.id) {
        const { error: updateSlotError } = await supabase
          .from("meeting_slot_candidates")
          .update({
            is_selected: true,
            proposed_by: "auto_generated",
            note: "캘린더 기반 자동 생성 가능 시간",
          })
          .eq("id", existingSlot.id);

        if (updateSlotError) {
          throw new Error(`자동 생성 슬롯 확정 실패: ${updateSlotError.message}`);
        }
      } else {
        const { error: insertSlotError } = await supabase
          .from("meeting_slot_candidates")
          .insert({
            meeting_request_id: request.id,
            start_datetime: slot.start_datetime,
            end_datetime: slot.end_datetime,
            proposed_by: "auto_generated",
            note: "캘린더 기반 자동 생성 가능 시간",
            is_selected: true,
          });

        if (insertSlotError) {
          throw new Error(`자동 생성 슬롯 저장 실패: ${insertSlotError.message}`);
        }
      }

      const { error: statusError } = await supabase
        .from("meeting_requests")
        .update({ status: "confirmed" })
        .eq("id", request.id);

      if (statusError) {
        throw new Error(`확정 상태 전환 실패: ${statusError.message}`);
      }

      await createChecklistIfNeeded(request.id);
      await fetchDetail();
      toast.success("추천 시간을 확정했어요.");
    } catch (error) {
      console.error(error);
      setErrorMessage(
        error instanceof Error ? error.message : "추천 시간 확정 중 오류가 발생했어요."
      );
    } finally {
      setUpdating(false);
    }
  }

  async function handleDeleteRequest() {
    if (!request) return;

    if (
      !confirmAction(
        "이 미팅 요청을 삭제할까요? 연결된 슬롯 후보와 체크리스트도 함께 삭제됩니다."
      )
    ) {
      return;
    }

    setUpdating(true);
    setErrorMessage("");

    try {
      await deleteMeetingRequestWithRelations({
        supabase,
        meetingRequestId: request.id,
      });
      router.push("/meeting-requests");
    } catch (error) {
      console.error("미팅 요청 삭제 에러:", error);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "미팅 요청 삭제 중 오류가 발생했어요."
      );
      setUpdating(false);
    }
  }

  function handleEditFieldChange(
    field: keyof MeetingRequestEditForm,
    value: string | boolean
  ) {
    setEditForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  async function handleParticipantSearch() {
    const query = participantQuery.trim();

    if (!query) {
      setParticipantCandidates([]);
      setParticipantSearchError("");
      setParticipantSearchEmpty(false);
      return;
    }

    setParticipantSearchLoading(true);
    setParticipantSearchError("");
    setParticipantSearchEmpty(false);

    try {
      const response = await fetch(
        `/api/google-people/search?query=${encodeURIComponent(query)}`
      );
      const result = (await response.json()) as {
        error?: string;
        results?: ParticipantSearchResult[];
      };

      if (!response.ok) {
        throw new Error(result.error || "참가자 검색에 실패했어요.");
      }

      const nextCandidates = (result.results || []).filter(
        (candidate, index, array) =>
          array.findIndex(
            (item) => item.email.toLowerCase() === candidate.email.toLowerCase()
          ) === index
      );
      setParticipantCandidates(nextCandidates);
      setParticipantSearchEmpty(nextCandidates.length === 0);
    } catch (searchError) {
      console.error(searchError);
      setParticipantCandidates([]);
      setParticipantSearchEmpty(false);
      setParticipantSearchError(
        searchError instanceof Error
          ? searchError.message
          : "참가자 검색 중 오류가 발생했어요."
      );
    } finally {
      setParticipantSearchLoading(false);
    }
  }

  function handleSelectParticipant(candidate: ParticipantSearchResult) {
    setEditForm((prev) => {
      const currentNames = parseParticipantNamesText(prev.participants_text);
      const candidateKey = getParticipantNameKey(candidate.name);

      if (currentNames.some((name) => getParticipantNameKey(name) === candidateKey)) {
        return prev;
      }

      const nextText = currentNames.length > 0
        ? `${currentNames.join(", ")}, ${normalizeParticipantName(candidate.name)}`
        : normalizeParticipantName(candidate.name);

      return {
        ...prev,
        participants_text: nextText,
      };
    });

    setParticipantEmailMap((prev) => ({
      ...prev,
      [getParticipantNameKey(candidate.name)]: candidate.email.trim().toLowerCase(),
    }));
    setParticipantQuery("");
    setParticipantCandidates([]);
    setParticipantSearchError("");
    setParticipantSearchEmpty(false);
    toast.success(`${normalizeParticipantName(candidate.name)} 참석자를 반영했어요.`);
  }

  function handleStartEdit() {
    if (!request) return;

    setEditForm(buildEditFormFromRequest(request));
    setParticipantEmailMap(buildParticipantEmailMap(request.participants_text));
    setParticipantQuery("");
    setParticipantCandidates([]);
    setParticipantSearchError("");
    setParticipantSearchEmpty(false);
    setIsEditMode(true);
    setErrorMessage("");
  }

  function handleCancelEdit() {
    if (!request) {
      setIsEditMode(false);
      return;
    }

    setEditForm(buildEditFormFromRequest(request));
    setParticipantEmailMap(buildParticipantEmailMap(request.participants_text));
    setParticipantQuery("");
    setParticipantCandidates([]);
    setParticipantSearchError("");
    setParticipantSearchEmpty(false);
    setIsEditMode(false);
    setErrorMessage("");
  }

  async function handleSaveRequestEdits() {
    if (!request) return;

    setUpdating(true);
    setErrorMessage("");
    const participantsValue = buildParticipantsStorageValueFromEmailMap({
      displayText: editForm.participants_text,
      emailMap: participantEmailMap,
    });

    const payload = {
      title: editForm.title.trim(),
      purpose: editForm.purpose.trim() || null,
      requester_name: editForm.requester_name.trim() || null,
      participants_text: participantsValue,
      external_flag: editForm.external_flag,
      preferred_date_range: editForm.preferred_date_range.trim() || null,
      planning_notes: editForm.planning_notes.trim() || null,
      background_notes: editForm.background_notes.trim() || null,
      importance: editForm.importance_level.trim() || null,
      urgency: editForm.urgency_level.trim() || null,
      memo: editForm.planning_notes.trim() || null,
    };

    const { error } = await supabase
      .from("meeting_requests")
      .update(payload)
      .eq("id", request.id);

    if (error) {
      console.error("미팅 요청 수정 에러:", error);
      setErrorMessage(`미팅 요청 저장 실패: ${error.message}`);
      setUpdating(false);
      return;
    }

    setAvailabilityItems([]);
    setAvailabilityError("");
    setIsEditMode(false);
    await fetchDetail();
    setUpdating(false);
    toast.success("미팅 요청을 저장했어요.");
  }

  function getChecklistCompletionRate(item: ExecutionChecklist | null) {
    if (!item) return 0;
    const completedCount = getChecklistCompletedCount(item);
    return Math.round((completedCount / CHECKLIST_FIELDS.length) * 100);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 px-6 py-8">
        <div className="mx-auto max-w-4xl rounded-2xl bg-white p-6 shadow-sm">
          <p className="text-sm text-gray-600">불러오는 중...</p>
        </div>
      </div>
    );
  }

  if (!request) {
    return (
      <div className="min-h-screen bg-gray-50 px-6 py-8">
        <div className="mx-auto max-w-4xl rounded-2xl bg-white p-6 shadow-sm">
          <p className="text-sm text-gray-600">해당 미팅 요청을 찾을 수 없어요.</p>
        </div>
      </div>
    );
  }

  const actions = getActionButtons(request.status);
  const riskType = getRiskType({
    status: request.status,
    urgency_level: request.urgency_level,
    slot: selectedSlot,
    checklist,
  });
  const warningMessage = getDetailWarningMessage({
    selectedSlot,
    checklist,
    riskType,
  });

  return (
    <div className="min-h-screen bg-gray-50 px-6 py-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Meeting Request Detail</h1>
            <p className="mt-2 text-sm text-gray-600">
              미팅 요청의 전체 흐름을 확인하는 화면이에요.
            </p>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                router.push("/meeting-requests");
              }}
              className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50"
            >
              목록으로
            </button>

            <button
              type="button"
              onClick={handleDeleteRequest}
              disabled={updating}
              className="rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-300"
            >
              {updating ? "처리중..." : "삭제"}
            </button>
          </div>
        </div>

        {errorMessage && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        )}

        {warningMessage && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {warningMessage}
          </div>
        )}

        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-xl font-semibold text-gray-900">{request.title}</h2>

              <span
                className={`rounded-full px-3 py-1 text-xs font-medium ${getStatusBadgeClass(
                  request.status
                )}`}
              >
                {getStatusLabel(request.status)}
              </span>

              <RiskBadge riskType={riskType} />

              {checklist && (
                <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-800">
                  완료도 {getChecklistCompletedCount(checklist)}/{CHECKLIST_FIELDS.length} (
                  {getChecklistCompletionRate(checklist)}%)
                </span>
              )}
            </div>

            {isEditMode ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  disabled={updating}
                  className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50 disabled:cursor-not-allowed disabled:bg-gray-100"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleSaveRequestEdits}
                  disabled={updating}
                  className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:cursor-not-allowed disabled:bg-gray-400"
                >
                  {updating ? "저장 중..." : "저장"}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleStartEdit}
                className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50"
              >
                수정
              </button>
            )}
          </div>

          {isEditMode ? (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    제목
                  </label>
                  <input
                    type="text"
                    value={editForm.title}
                    onChange={(e) => handleEditFieldChange("title", e.target.value)}
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    요청자
                  </label>
                  <input
                    type="text"
                    value={editForm.requester_name}
                    onChange={(e) =>
                      handleEditFieldChange("requester_name", e.target.value)
                    }
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    희망 시기
                  </label>
                  <input
                    type="text"
                    value={editForm.preferred_date_range}
                    onChange={(e) =>
                      handleEditFieldChange("preferred_date_range", e.target.value)
                    }
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    목적
                  </label>
                  <input
                    type="text"
                    value={editForm.purpose}
                    onChange={(e) => handleEditFieldChange("purpose", e.target.value)}
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    중요도
                  </label>
                  <select
                    value={editForm.importance_level}
                    onChange={(e) =>
                      handleEditFieldChange("importance_level", e.target.value)
                    }
                    className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-gray-500"
                  >
                    <option value="">선택 안 함</option>
                    <option value="low">낮음</option>
                    <option value="medium">보통</option>
                    <option value="high">높음</option>
                    <option value="critical">매우 높음</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    긴급도
                  </label>
                  <select
                    value={editForm.urgency_level}
                    onChange={(e) =>
                      handleEditFieldChange("urgency_level", e.target.value)
                    }
                    className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-gray-500"
                  >
                    <option value="">선택 안 함</option>
                    <option value="low">여유 있음</option>
                    <option value="medium">보통</option>
                    <option value="urgent">급함</option>
                    <option value="asap">즉시 필요</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  참석자
                </label>
                <textarea
                  value={editForm.participants_text}
                  onChange={(e) =>
                    handleEditFieldChange("participants_text", e.target.value)
                  }
                  rows={3}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
                  placeholder="이름을 쉼표로 구분해서 적어주세요"
                />
                <p className="mt-1 text-xs text-gray-500">
                  이 입력칸의 이름 목록이 저장 기준입니다. 일부만 지우면 그 이름만 저장에서 빠집니다.
                </p>

                <div className="mt-3 rounded-xl bg-gray-50 p-3">
                  <label className="mb-1 block text-xs font-medium text-gray-600">
                    참가자 검색
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={participantQuery}
                      onChange={(e) => setParticipantQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void handleParticipantSearch();
                        }
                      }}
                      placeholder="이름으로 검색"
                      className="flex-1 rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
                    />
                    <button
                      type="button"
                      onClick={handleParticipantSearch}
                      disabled={participantSearchLoading}
                      className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-gray-400"
                    >
                      {participantSearchLoading ? "검색 중..." : "검색"}
                    </button>
                  </div>

                  {participantSearchError && (
                    <p className="mt-2 text-xs text-red-600">
                      {participantSearchError}
                    </p>
                  )}

                  {participantSearchEmpty && !participantSearchError && (
                    <p className="mt-2 text-xs text-gray-500">
                      검색 결과가 없습니다.
                    </p>
                  )}

                  {participantCandidates.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {participantCandidates.map((candidate) => {
                        const alreadySelected = parseParticipantNamesText(
                          editForm.participants_text
                        ).some(
                          (name) =>
                            getParticipantNameKey(name) ===
                            getParticipantNameKey(candidate.name)
                        );

                        return (
                          <button
                            key={candidate.email}
                            type="button"
                            onClick={() => handleSelectParticipant(candidate)}
                            disabled={alreadySelected}
                            className="block w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-left hover:bg-gray-100 disabled:cursor-not-allowed disabled:bg-gray-100"
                          >
                            <p className="text-sm font-medium text-gray-900">
                              {candidate.name}
                            </p>
                            <p className="text-xs text-gray-600">{candidate.email}</p>
                            {candidate.organization && (
                              <p className="text-xs text-gray-500">
                                {candidate.organization}
                              </p>
                            )}
                            {alreadySelected && (
                              <p className="mt-1 text-xs text-blue-600">이미 선택됨</p>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              <label className="flex items-center gap-3 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={editForm.external_flag}
                  onChange={(e) =>
                    handleEditFieldChange("external_flag", e.target.checked)
                  }
                />
                외부 참석자 있음
              </label>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  운영 메모
                </label>
                <textarea
                  value={editForm.planning_notes}
                  onChange={(e) =>
                    handleEditFieldChange("planning_notes", e.target.value)
                  }
                  rows={4}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  배경 메모
                </label>
                <textarea
                  value={editForm.background_notes}
                  onChange={(e) =>
                    handleEditFieldChange("background_notes", e.target.value)
                  }
                  rows={4}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
                />
              </div>
            </div>
          ) : (
            <>
              <div className="grid gap-3 text-sm text-gray-700 md:grid-cols-2">
                <p>
                  <span className="font-medium">요청자:</span> {request.requester_name || "-"}
                </p>
                <p>
                  <span className="font-medium">희망 시기:</span>{" "}
                  {request.preferred_date_range || "-"}
                </p>
                <p>
                  <span className="font-medium">소요 시간:</span>{" "}
                  {formatDuration(request.duration_minutes)}
                </p>
                <p>
                  <span className="font-medium">목적:</span> {request.purpose || "-"}
                </p>
                <p>
                  <span className="font-medium">참석자:</span> {getParticipantsDisplay()}
                </p>
                <p>
                  <span className="font-medium">외부 참석:</span>{" "}
                  {request.external_flag ? "예" : "아니오"}
                </p>
                <p>
                  <span className="font-medium">중요도:</span> {request.importance_level || "-"}
                </p>
                <p>
                  <span className="font-medium">긴급도:</span> {request.urgency_level || "-"}
                </p>
              </div>

              <div className="mt-4">
                <p className="text-sm text-gray-700">
                  <span className="font-medium">메모:</span> {getPrimaryPlanningNotes(request)}
                </p>
              </div>

              {request.background_notes && (
                <div className="mt-2">
                  <p className="text-sm text-gray-700">
                    <span className="font-medium">배경 메모:</span> {request.background_notes}
                  </p>
                </div>
              )}
            </>
          )}

          <div className="mt-4 rounded-xl bg-blue-50 p-4">
            <p className="text-sm font-medium text-blue-900">확정된 슬롯</p>

            {selectedSlot ? (
              <div className="mt-2 space-y-1 text-sm text-blue-900">
                <p>
                  {formatDate(selectedSlot.start_datetime)} ~{" "}
                  {formatDate(selectedSlot.end_datetime)}
                </p>
                <p>제안자: {selectedSlot.proposed_by || "-"}</p>
                <p>메모: {selectedSlot.note || "-"}</p>
              </div>
            ) : (
              <p className="mt-2 text-sm text-blue-700">
                아직 확정된 시간이 없어요.
              </p>
            )}
          </div>

          <p className="mt-4 text-xs text-gray-500">
            생성일: {formatDate(request.created_at)}
          </p>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
          <h3 className="mb-4 text-lg font-semibold text-gray-900">상태 변경</h3>

          {actions.length === 0 ? (
            <p className="text-sm text-gray-500">지금 변경 가능한 상태 버튼이 없어요.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {actions.map((action) => {
                const isDoneAction = action.nextStatus === "done";
                const isConfirmAction = action.nextStatus === "confirmed";

                const isDisabled =
                  updating ||
                  (isDoneAction && !canCompleteRequest(checklist)) ||
                  (isConfirmAction && !canConfirmRequest(selectedSlot));

                return (
                  <button
                    key={action.label}
                    type="button"
                    onClick={() => handleStatusUpdate(action.nextStatus)}
                    disabled={isDisabled}
                    title={
                      isDoneAction && !canCompleteRequest(checklist)
                        ? "체크리스트를 모두 완료해야 완료 처리할 수 있어요."
                        : isConfirmAction && !canConfirmRequest(selectedSlot)
                        ? "확정된 슬롯이 있어야 일정 확정이 가능해요."
                        : undefined
                    }
                    className={getActionButtonClass(action.style)}
                  >
                    {updating ? "처리중..." : action.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {availabilityItems.length > 0 && (
          <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                캘린더 기반 자동 생성 가능 시간
              </h3>
              <p className="mt-1 text-sm text-gray-600">
                Availability 결과를 바탕으로 희망 시기 범위 안에서 전원 공통 가능 시간을 새로 생성했어요.
                시간 생성 범위는 주중 07:00~20:00 전체이고, 추천은 09:00~18:00 핵심 시간대를 우선해요.
                추천 계산에서는 시간형 일정만 busy로 반영하고, 종일 일정과 transparent 일정은 제외해요.
              </p>
              <p className="mt-2 text-xs font-medium text-indigo-700">
                겹치는 연속 가능 슬롯은 하나의 가능 구간으로 묶고, 각 구간에서 대표 추천 시간 1개만 보여줘요.
              </p>
            </div>

            {generatedRecommendedSlots.length > 0 ? (
              <div className="space-y-3">
                {generatedRecommendedSlots.map((slot, index) => (
                  <div
                    key={slot.id}
                    className="rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-indigo-900">
                          추천 {index + 1}
                        </p>
                        <p className="mt-1 text-sm text-indigo-900">
                          {formatDate(slot.window_start)} 중 {formatDuration(request.duration_minutes)}
                        </p>
                        <p className="mt-1 text-sm text-indigo-700">
                          가능 구간: {formatTimeRangeLabel(slot.window_start, slot.window_end)}
                        </p>
                        <p className="mt-1 text-sm font-medium text-indigo-900">
                          대표 추천: {formatTimeRangeLabel(slot.start_datetime, slot.end_datetime)}
                        </p>
                      </div>

                      <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
                        전원 공통 가능
                      </span>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {slot.reasons.map((reason) => (
                        <span
                          key={`${slot.id}-${reason}`}
                          className="rounded-full bg-white px-3 py-1 text-xs text-gray-700 ring-1 ring-gray-200"
                        >
                          {reason}
                        </span>
                      ))}
                    </div>

                    <div className="mt-4">
                      <button
                        type="button"
                        onClick={() => handleConfirmGeneratedSlot(slot)}
                        disabled={updating}
                        className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-300"
                      >
                        {updating ? "처리중..." : "이 시간으로 확정"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-4 text-sm text-gray-600">
                희망 시기 범위 안에서 전원 공통 가능 시간을 찾지 못했어요.
              </div>
            )}
          </div>
        )}

        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
          <p className="text-sm font-medium text-gray-900">수동 후보 시간 관리</p>
          <p className="mt-1 text-xs text-gray-600">
            아래 영역은 직접 입력한 후보 시간을 관리하는 곳이에요. 위 추천 시간은 시스템이 Availability를 바탕으로 새로 생성한 결과예요.
          </p>
        </div>

        <SlotCandidatesSection
          meetingRequestId={requestId}
          onSlotsChanged={fetchDetail}
          availabilityItems={availabilityItems}
        />

        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                캘린더 이벤트 미리보기
              </h3>
              <p className="mt-1 text-sm text-gray-600">
                확정된 슬롯 기준으로 캘린더에 넣을 정보를 미리 만들어요.
              </p>
            </div>
          </div>

          {selectedSlot ? (
            <div className="space-y-4">
              <div className="rounded-xl bg-gray-50 p-4">
                <p className="text-xs font-medium text-gray-500">이벤트 제목</p>
                <p className="mt-2 text-sm font-semibold text-gray-900">
                  {buildCalendarTitle()}
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl bg-gray-50 p-4">
                  <p className="text-xs font-medium text-gray-500">시작</p>
                  <p className="mt-2 text-sm text-gray-900">
                    {formatDateTimeForCalendar(selectedSlot.start_datetime)}
                  </p>
                </div>

                <div className="rounded-xl bg-gray-50 p-4">
                  <p className="text-xs font-medium text-gray-500">종료</p>
                  <p className="mt-2 text-sm text-gray-900">
                    {formatDateTimeForCalendar(selectedSlot.end_datetime)}
                  </p>
                </div>
              </div>

              <div className="rounded-xl bg-gray-50 p-4">
                <p className="text-xs font-medium text-gray-500">복사용 안내 문구</p>
                <pre className="mt-2 whitespace-pre-wrap text-sm text-gray-900">
                  {buildCalendarCopyMessage()}
                </pre>
              </div>

              <div className="rounded-xl bg-gray-50 p-4">
                <p className="text-xs font-medium text-gray-500">참석자 이메일 복사용</p>
                <pre className="mt-2 whitespace-pre-wrap text-sm text-gray-900">
                  {buildAttendeeEmailsCopyText() || "-"}
                </pre>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleCopyCalendarMessage}
                  className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-black"
                >
                  안내 문구 복사
                </button>

                <button
                  type="button"
                  onClick={handleCopyAttendeeEmails}
                  className="rounded-xl bg-gray-200 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-300"
                >
                  참석자 이메일 복사
                </button>

                <button
                  type="button"
                  onClick={handleOpenGoogleCalendar}
                  className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  Google Calendar에서 열기
                </button>

                <button
                  type="button"
                  onClick={handleCreateCalendarEventViaApi}
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                >
                  API route 테스트
                </button>
              </div>
            </div>
          ) : (
            <div className="text-sm text-gray-600">
              아직 확정된 슬롯이 없어서 캘린더 이벤트를 만들 수 없어요.
            </div>
          )}

          <div className="mt-4 rounded-xl bg-gray-50 p-4">
            <div>
              <p className="text-xs font-medium text-gray-500">
                참석자 Availability
              </p>
              <p className="mt-1 text-sm text-gray-700">
                슬롯 확인 상태로 들어가면 참석자 캘린더를 자동 조회해요.
                조회 결과는 위의 자동 생성 가능 시간과 아래 수동 후보 시간에 함께 반영돼요.
              </p>
              {availabilityLoading && (
                <p className="mt-2 text-xs font-medium text-indigo-700">
                  참석자 캘린더를 자동 조회하는 중이에요.
                </p>
              )}
            </div>

            <p className="mt-3 text-xs text-gray-500">
              조회 대상 이메일:{" "}
              {availabilityLookupSummary?.resolvedEmails?.length
                ? availabilityLookupSummary.resolvedEmails.join("; ")
                : getParticipantEmails().length > 0
                ? getParticipantEmails().join("; ")
                : "없음"}
            </p>

            {availabilityError && (
              <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {availabilityError}
              </div>
            )}

            {availabilityLookupSummary && (
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                  <p className="text-xs font-medium text-emerald-800">
                    자동 매핑 성공
                  </p>
                  {availabilityLookupSummary.autoMapped.length > 0 ? (
                    <div className="mt-2 space-y-1 text-xs text-emerald-900">
                      {availabilityLookupSummary.autoMapped.map((item) => (
                        <p key={`${item.name}-${item.email}`}>
                          {item.name}
                          {" -> "}
                          {item.email}
                        </p>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-emerald-900">없음</p>
                  )}
                </div>

                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                  <p className="text-xs font-medium text-amber-800">
                    매핑 실패
                  </p>
                  {availabilityLookupSummary.failed.length > 0 ? (
                    <div className="mt-2 space-y-1 text-xs text-amber-900">
                      {availabilityLookupSummary.failed.map((name) => (
                        <p key={name}>{name}</p>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-amber-900">없음</p>
                  )}
                </div>

                <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                  <p className="text-xs font-medium text-gray-700">
                    애매해서 제외
                  </p>
                  {availabilityLookupSummary.ambiguous.length > 0 ? (
                    <div className="mt-2 space-y-1 text-xs text-gray-800">
                      {availabilityLookupSummary.ambiguous.map((name) => (
                        <p key={name}>{name}</p>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-gray-800">없음</p>
                  )}
                </div>
              </div>
            )}

            {availabilityItems.length > 0 && (
              <div className="mt-4 space-y-3">
                {availabilityItems.map((item) => (
                  <div
                    key={item.email}
                    className="rounded-xl border border-gray-200 bg-white px-4 py-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-gray-900">{item.email}</p>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-medium ${
                          item.isFree
                            ? "bg-green-100 text-green-700"
                            : "bg-yellow-100 text-yellow-800"
                        }`}
                      >
                        {item.isFree ? "조회 구간 내 충돌 없음" : "일부 시간 busy"}
                      </span>
                    </div>

                    {!item.isFree && (
                      <div className="mt-2 space-y-1 text-xs text-gray-600">
                        {item.busy.map((busySlot, index) => (
                          <p key={`${item.email}-${index}`}>
                            {formatDateTimeForCalendar(busySlot.start)} ~{" "}
                            {formatDateTimeForCalendar(busySlot.end)}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">체크리스트</h3>

            <button
              type="button"
              onClick={() => {
                router.push(`/execution-checklists?requestId=${request.id}`);
              }}
              className="rounded-xl bg-gray-800 px-4 py-2 text-sm font-medium text-white hover:bg-gray-900"
            >
              체크리스트 페이지로 이동
            </button>
          </div>

          {checklist ? (
            <div className="space-y-4 text-sm text-gray-700">
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p>
                    <span className="font-medium">완료도:</span>{" "}
                    {getChecklistCompletedCount(checklist)}/{CHECKLIST_FIELDS.length}
                  </p>
                  <p className="text-sm text-gray-600">
                    {getChecklistCompletionRate(checklist)}%
                  </p>
                </div>

                <div className="h-3 w-full overflow-hidden rounded-full bg-gray-200">
                  <div
                    className="h-full rounded-full bg-gray-900 transition-all"
                    style={{
                      width: `${getChecklistCompletionRate(checklist)}%`,
                    }}
                  />
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {CHECKLIST_FIELDS.map((field) => (
                  <label
                    key={field}
                    className="flex cursor-pointer items-center gap-3 rounded-xl border border-gray-200 px-4 py-3 hover:bg-gray-50"
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(checklist[field])}
                      onChange={() => handleChecklistToggle(field)}
                      disabled={updating}
                    />
                    <span>{CHECKLIST_LABELS[field]}</span>
                  </label>
                ))}
              </div>

              <div className="space-y-4 rounded-xl bg-gray-50 p-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    현장 담당자
                  </label>
                  <input
                    type="text"
                    value={onsiteOwnerInput}
                    onChange={(e) => setOnsiteOwnerInput(e.target.value)}
                    disabled={updating}
                    className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-gray-500"
                    placeholder="현장 담당자 이름"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    룸 정보
                  </label>
                  <input
                    type="text"
                    value={roomInfoInput}
                    onChange={(e) => setRoomInfoInput(e.target.value)}
                    disabled={updating}
                    className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-gray-500"
                    placeholder="회의실 / 층수 / 장소 정보"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    특이사항
                  </label>
                  <textarea
                    value={specialNotesInput}
                    onChange={(e) => setSpecialNotesInput(e.target.value)}
                    disabled={updating}
                    rows={4}
                    className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-gray-500"
                    placeholder="출입, 주차, 장비, 유의사항 등을 적어줘"
                  />
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleChecklistTextSave}
                    disabled={updating}
                    className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:cursor-not-allowed disabled:bg-gray-400"
                  >
                    {updating ? "저장 중..." : "텍스트 저장"}
                  </button>
                </div>
              </div>

              <p className="text-xs text-gray-500">
                생성일: {formatDate(checklist.created_at)} / 수정일:{" "}
                {formatDate(checklist.updated_at)}
              </p>
            </div>
          ) : (
            <div className="text-sm text-gray-600">
              아직 연결된 체크리스트가 없어요. 확정하면 자동 생성돼요.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

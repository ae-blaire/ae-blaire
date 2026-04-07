"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { rankSlots } from "@/lib/recommend";
import { getSlotAvailability } from "@/lib/availability";
import toast from "react-hot-toast";

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function formatTimeLabel(hour: number, minute: number) {
  const period = hour < 12 ? "오전" : "오후";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${period} ${displayHour}:${pad2(minute)}`;
}

function buildTimeOptions(startHour = 7, endHour = 22) {
  const options: { value: string; label: string }[] = [];

  for (let hour = startHour; hour <= endHour; hour += 1) {
    for (let minute = 0; minute < 60; minute += 15) {
      options.push({
        value: `${pad2(hour)}:${pad2(minute)}`,
        label: formatTimeLabel(hour, minute),
      });
    }
  }

  return options;
}

function timeToMinutes(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

type SlotCandidate = {
  id: string | null;
  meeting_request_id: string;
  start_datetime: string;
  end_datetime: string;
  note: string | null;
  proposed_by: string | null;
  is_selected: boolean;
  created_at: string;
  updated_at: string;
};

type MeetingRequestForRecommendation = {
  importance_level?: string | number | null;
  urgency_level?: string | number | null;
  importance?: string | number | null;
  urgency?: string | number | null;
  preferred_date_range?: string | null;
  duration_minutes?: number | null;
};

type Props = {
  meetingRequestId: string;
  onSlotsChanged?: () => void;
  availabilityItems?: Array<{
    email: string;
    busy: Array<{
      start: string;
      end: string;
    }>;
    isFree: boolean;
  }>;
};

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export default function SlotCandidatesSection({
  meetingRequestId,
  onSlotsChanged,
  availabilityItems = [],
}: Props) {
  const [slots, setSlots] = useState<SlotCandidate[]>([]);
  const [request, setRequest] = useState<MeetingRequestForRecommendation | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [slotDate, setSlotDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [note, setNote] = useState("");
  const [proposedBy, setProposedBy] = useState("");

  const timeOptions = useMemo(() => buildTimeOptions(7, 22), []);
  const endTimeOptions = useMemo(() => {
    if (!startTime) return timeOptions;
    return timeOptions.filter(
      (option) => timeToMinutes(option.value) > timeToMinutes(startTime)
    );
  }, [startTime, timeOptions]);

  useEffect(() => {
    if (!startTime) return;
    if (!endTime) return;

    if (timeToMinutes(endTime) <= timeToMinutes(startTime)) {
      const nextOption = timeOptions.find(
        (option) => timeToMinutes(option.value) > timeToMinutes(startTime)
      );

      if (nextOption) {
        setEndTime(nextOption.value);
      }
    }
  }, [startTime, endTime, timeOptions]);

const rankedSlots = useMemo(() => {
  const normalizedSlots = slots.map((slot) => ({
    ...slot,
    id: slot.id ?? undefined,
  }));

  const ranked = rankSlots(request ?? {}, normalizedSlots);

  return ranked.sort((a, b) => {
    if (a.slot.is_selected && !b.slot.is_selected) return -1;
    if (!a.slot.is_selected && b.slot.is_selected) return 1;
    return b.score - a.score;
  });
}, [request, slots]);

  const selectedSlot = useMemo(() => {
    return slots.find((slot) => slot.is_selected) || null;
  }, [slots]);

  const slotAvailabilityMap = useMemo(() => {
    const results = getSlotAvailability(slots, availabilityItems);

    return results.reduce<
      Record<
        string,
        {
          isAvailableForAll: boolean;
          conflictCount: number;
          conflictParticipants: string[];
        }
      >
    >((acc, item) => {
      const key = item.slot.id ?? `${item.slot.start_datetime}-${item.slot.end_datetime}`;
      acc[String(key)] = {
        isAvailableForAll: item.isAvailableForAll,
        conflictCount: item.conflictCount,
        conflictParticipants: item.conflictParticipants,
      };
      return acc;
    }, {});
  }, [slots, availabilityItems]);

  async function createChecklistIfNeeded() {
    const { data: existingChecklist, error: checkError } = await supabase
      .from("execution_checklists")
      .select("id")
      .eq("meeting_request_id", meetingRequestId)
      .maybeSingle();

    if (checkError) {
      throw new Error(`기존 체크리스트 확인 실패: ${checkError.message}`);
    }

    if (existingChecklist) return;

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

  async function updateMeetingRequestStatusByAction(
    action: "slot_added" | "slot_selected"
  ) {
    const { data: requestData, error: requestError } = await supabase
      .from("meeting_requests")
      .select("id, status")
      .eq("id", meetingRequestId)
      .maybeSingle();

    if (requestError) {
      throw new Error(`미팅 요청 상태 조회 실패: ${requestError.message}`);
    }

    const currentStatus = requestData?.status;

    if (!currentStatus) return;

    if (action === "slot_added") {
      if (["received", "reviewing", "rejected"].includes(currentStatus)) {
        const { error: updateError } = await supabase
          .from("meeting_requests")
          .update({ status: "slot_checking" })
          .eq("id", meetingRequestId);

        if (updateError) {
          throw new Error(`slot_checking 자동 전환 실패: ${updateError.message}`);
        }
      }

      return;
    }

    if (action === "slot_selected") {
      if (currentStatus !== "done") {
        const { error: updateError } = await supabase
          .from("meeting_requests")
          .update({ status: "confirmed" })
          .eq("id", meetingRequestId);

        if (updateError) {
          throw new Error(`confirmed 자동 전환 실패: ${updateError.message}`);
        }
      }

      await createChecklistIfNeeded();
    }
  }

  async function fetchRequestForRecommendation() {
    const { data, error } = await supabase
      .from("meeting_requests")
      .select("importance, urgency, preferred_date_range, duration_minutes")
      .eq("id", meetingRequestId)
      .maybeSingle();

    if (error) {
      console.error("추천용 요청 조회 오류:", JSON.stringify(error, null, 2));
      toast.error("추천용 요청 정보를 불러오지 못했어요.");
      return;
    }

    if (!data) {
      console.warn("추천용 요청 데이터가 없습니다.", { meetingRequestId });
      return;
    }

    const requestData = data as MeetingRequestForRecommendation;
    const normalized: MeetingRequestForRecommendation = {
      ...requestData,
      importance_level: requestData.importance_level ?? requestData.importance ?? null,
      urgency_level: requestData.urgency_level ?? requestData.urgency ?? null,
    };

    setRequest(normalized);
  }

  async function fetchSlots() {
    setLoading(true);

    const { data, error } = await supabase
      .from("meeting_slot_candidates")
      .select("*")
      .eq("meeting_request_id", meetingRequestId)
      .order("start_datetime", { ascending: true });

    if (error) {
      console.error("슬롯 조회 오류:", error);
      toast.error("슬롯 후보를 불러오지 못했어요.");
      setLoading(false);
      return;
    }

    setSlots((data as SlotCandidate[]) || []);
    setLoading(false);
  }

  useEffect(() => {
    if (!meetingRequestId) return;
    void fetchRequestForRecommendation();
    void fetchSlots();
  }, [meetingRequestId]);

  async function handleSelectSlot(slotId: string) {
    setSubmitting(true);

    const { error: clearError } = await supabase
      .from("meeting_slot_candidates")
      .update({ is_selected: false })
      .eq("meeting_request_id", meetingRequestId);

    if (clearError) {
      console.error("기존 선택 해제 오류:", clearError);
      toast.error("기존 선택을 해제하지 못했어요.");
      setSubmitting(false);
      return;
    }

    const { error: selectError } = await supabase
      .from("meeting_slot_candidates")
      .update({ is_selected: true })
      .eq("id", slotId);

    if (selectError) {
      console.error("슬롯 선택 오류:", selectError);
      toast.error("슬롯 확정에 실패했어요.");
      setSubmitting(false);
      return;
    }

    try {
      await updateMeetingRequestStatusByAction("slot_selected");
      toast.success("슬롯을 확정했어요.");
    } catch (error) {
      console.error(error);
      toast.error(
        error instanceof Error
          ? error.message
          : "상태 자동 변경 중 오류가 발생했어요."
      );
    }

    await fetchSlots();
    onSlotsChanged?.();
    setSubmitting(false);
  }

  async function handleDeleteSlot(slotId: string) {
    const confirmed = window.confirm("이 후보 시간을 삭제할까요?");
    if (!confirmed) return;

    setSubmitting(true);

    const { error } = await supabase
      .from("meeting_slot_candidates")
      .delete()
      .eq("id", slotId);

    if (error) {
      console.error("슬롯 삭제 오류:", error);
      toast.error("슬롯 삭제에 실패했어요.");
      setSubmitting(false);
      return;
    }

    toast.success("슬롯을 삭제했어요.");
    await fetchSlots();
    onSlotsChanged?.();
    setSubmitting(false);
  }

  async function handleAddSlot(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!slotDate || !startTime || !endTime) {
      toast.error("날짜와 시간을 모두 입력해주세요.");
      return;
    }

    const start = new Date(`${slotDate}T${startTime}`);
    const end = new Date(`${slotDate}T${endTime}`);

    if (end <= start) {
      toast.error("종료 시간은 시작 시간보다 뒤여야 합니다.");
      return;
    }

    setSubmitting(true);

    const { error } = await supabase.from("meeting_slot_candidates").insert({
      meeting_request_id: meetingRequestId,
      start_datetime: start.toISOString(),
      end_datetime: end.toISOString(),
      note: note || null,
      proposed_by: proposedBy || null,
      is_selected: false,
    });

    if (error) {
      console.error("슬롯 추가 오류:", error);
      toast.error("슬롯 후보 추가에 실패했어요.");
      setSubmitting(false);
      return;
    }

    setSlotDate("");
    setStartTime("");
    setEndTime("");
    setNote("");
    setProposedBy("");

    try {
      await updateMeetingRequestStatusByAction("slot_added");
      toast.success("슬롯 후보를 추가했어요.");
    } catch (error) {
      console.error(error);
      toast.error(
        error instanceof Error
          ? error.message
          : "상태 자동 변경 중 오류가 발생했어요."
      );
    }

    await fetchSlots();
    onSlotsChanged?.();
    setSubmitting(false);
  }

  return (
    <section className="space-y-4 rounded-2xl border bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Slot Candidates</h2>
        <span className="text-sm text-gray-500">총 {slots.length}개</span>
      </div>

      <div className="rounded-xl border bg-gray-50 p-4">
        <div className="mb-2 text-sm font-medium text-gray-900">확정된 슬롯</div>

        {selectedSlot ? (
          <div className="space-y-1">
            <div className="text-sm font-semibold text-blue-700">
              {formatDateTime(selectedSlot.start_datetime)} ~{" "}
              {formatDateTime(selectedSlot.end_datetime)}
            </div>
            <div className="text-sm text-gray-600">
              제안자: {selectedSlot.proposed_by || "-"}
            </div>
            <div className="text-sm text-gray-600">
              메모: {selectedSlot.note || "-"}
            </div>
          </div>
        ) : (
          <div className="text-sm text-gray-500">
            아직 확정된 시간이 없습니다.
          </div>
        )}
      </div>

      <div className="space-y-3">
        {loading ? (
          <div className="text-sm text-gray-500">불러오는 중...</div>
        ) : rankedSlots.length === 0 ? (
          <div className="rounded-xl border border-dashed p-4 text-sm text-gray-500">
            아직 후보 시간이 없습니다.
          </div>
        ) : (
          rankedSlots.map(({ slot, score, badges, reasons }, index) => {
            const slotKey = String(
              slot.id ?? `${slot.start_datetime}-${slot.end_datetime}`
            );
            const availability = slotAvailabilityMap[slotKey];
            const attendeeCount = availabilityItems.length;
            const isFullyBlocked =
              !!availability &&
              attendeeCount > 0 &&
              availability.conflictCount === attendeeCount;

            return (
            <div
              key={slotKey}
              className={`space-y-2 rounded-xl border p-4 ${
                slot.is_selected
                  ? "border-blue-500 bg-blue-50"
                  : index === 0
                  ? "border-amber-300 bg-amber-50"
                  : "border-gray-200"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="font-medium">
                  {formatDateTime(slot.start_datetime)} ~{" "}
                  {formatDateTime(slot.end_datetime)}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {index === 0 && !slot.is_selected && (
                    <span className="rounded-full bg-amber-500 px-2 py-1 text-xs font-medium text-white">
                      ⭐ 추천
                    </span>
                  )}

                  {availability && (
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-medium text-white ${
                        availability.isAvailableForAll
                          ? "bg-emerald-600"
                          : isFullyBlocked
                          ? "bg-red-600"
                          : "bg-orange-500"
                      }`}
                    >
                      {availability.isAvailableForAll
                        ? "공통 가능"
                        : isFullyBlocked
                        ? "전원 충돌"
                        : "일부 충돌"}
                    </span>
                  )}

                  {slot.is_selected && (
                    <span className="rounded-full bg-blue-600 px-2 py-1 text-xs text-white">
                      확정
                    </span>
                  )}

                  <span className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-700">
                    점수 {score}
                  </span>
                </div>
              </div>

              {badges.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {badges.map((badge) => (
                    <span
                      key={`${slot.id}-${badge}`}
                      className="rounded-full bg-white px-2 py-1 text-xs text-gray-700 ring-1 ring-gray-200"
                    >
                      {badge}
                    </span>
                  ))}
                </div>
              )}

              <div className="text-sm text-gray-600">
                제안자: {slot.proposed_by || "-"}
              </div>

              <div className="text-sm text-gray-600">
                메모: {slot.note || "-"}
              </div>

              <div className="rounded-lg bg-white/70 px-3 py-2 text-sm text-gray-700 ring-1 ring-gray-100">
                {reasons.join(" ")}
              </div>

              {availability && !availability.isAvailableForAll && (
                <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-100">
                  충돌 참가자: {availability.conflictParticipants.join(", ")}
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => slot.id && handleSelectSlot(slot.id)}
                  disabled={submitting || !slot.id}
                  className={`rounded-lg px-3 py-2 text-sm font-medium ${
                    slot.is_selected
                      ? "bg-blue-600 text-white"
                      : "bg-gray-900 text-white"
                  } disabled:opacity-50`}
                >
                  {slot.is_selected ? "확정됨" : "이 시간으로 확정"}
                </button>

                <button
                  type="button"
                  onClick={() => slot.id && handleDeleteSlot(slot.id)}
                  disabled={submitting || !slot.id}
                  className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-600 disabled:opacity-50"
                >
                  삭제
                </button>
              </div>
            </div>
          )})
        )}
      </div>

      <form onSubmit={handleAddSlot} className="space-y-3 rounded-xl border p-4">
        <div className="text-sm font-medium">후보 시간 추가</div>

        <div className="grid gap-3 md:grid-cols-3">
          <input
            type="date"
            value={slotDate}
            onChange={(e) => setSlotDate(e.target.value)}
            className="rounded border p-2"
          />

          <select
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-gray-500"
          >
            <option value="">시작 시간 선택</option>
            {timeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <select
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-gray-500"
          >
            <option value="">종료 시간 선택</option>
            {endTimeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <input
          value={proposedBy}
          onChange={(e) => setProposedBy(e.target.value)}
          placeholder="제안자"
          className="w-full rounded border p-2"
        />
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="메모"
          className="w-full rounded border p-2"
        />

        <button
          type="submit"
          className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
          disabled={submitting}
        >
          {submitting ? "처리 중..." : "추가"}
        </button>
      </form>
    </section>
  );
}

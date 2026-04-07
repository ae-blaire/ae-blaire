"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getChecklistCount, getRiskType, type RiskType } from "@/lib/risk";

type MeetingRequest = {
  id: string | number;
  status: string | null;
  title: string;
  requester_name: string | null;
  preferred_date_range: string | null;
  duration_minutes: number | null;
  urgency_level: number | null;
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
  updated_at: string | null;
};

type SelectedSlot = {
  id: string;
  meeting_request_id: string | number;
  start_datetime: string;
  end_datetime: string;
  proposed_by: string | null;
  note: string | null;
};

type StatusCountMap = Record<string, number>;

const CHECKLIST_FIELDS = [
  "invite_sent",
  "venue_confirmed",
  "access_registered",
  "parking_registered",
  "equipment_checked",
  "attendee_finalized",
] as const;

export default function DashboardPage() {
  const router = useRouter();
  const [requests, setRequests] = useState<MeetingRequest[]>([]);
  const [checklists, setChecklists] = useState<ExecutionChecklist[]>([]);
  const [selectedSlots, setSelectedSlots] = useState<SelectedSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  async function fetchDashboardData() {
    setLoading(true);
    setErrorMessage("");

    const [requestsResult, checklistsResult, selectedSlotsResult] = await Promise.all([
      supabase
        .from("meeting_requests")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase
        .from("execution_checklists")
        .select("*")
        .order("updated_at", { ascending: false }),
      supabase
        .from("meeting_slot_candidates")
        .select("id, meeting_request_id, start_datetime, end_datetime, proposed_by, note")
        .eq("is_selected", true)
        .order("start_datetime", { ascending: true }),
    ]);

    if (requestsResult.error) {
      console.error("meeting_requests 조회 에러:", requestsResult.error);
      setErrorMessage(
        `미팅 요청 데이터를 불러오지 못했어요. (${requestsResult.error.message})`
      );
      setLoading(false);
      return;
    }

    if (checklistsResult.error) {
      console.error("execution_checklists 조회 에러:", checklistsResult.error);
      setErrorMessage(
        `체크리스트 데이터를 불러오지 못했어요. (${checklistsResult.error.message})`
      );
      setLoading(false);
      return;
    }

    if (selectedSlotsResult.error) {
      console.error("meeting_slot_candidates 조회 에러:", selectedSlotsResult.error);
      setErrorMessage(
        `확정 슬롯 데이터를 불러오지 못했어요. (${selectedSlotsResult.error.message})`
      );
      setLoading(false);
      return;
    }

    setRequests((requestsResult.data as MeetingRequest[]) || []);
    setChecklists((checklistsResult.data as ExecutionChecklist[]) || []);
    setSelectedSlots((selectedSlotsResult.data as SelectedSlot[]) || []);
    setLoading(false);
  }

  useEffect(() => {
    void fetchDashboardData();
  }, []);

  const slotMap = useMemo(() => {
    const map: Record<string, SelectedSlot> = {};

    selectedSlots.forEach((slot) => {
      map[String(slot.meeting_request_id)] = slot;
    });

    return map;
  }, [selectedSlots]);

  const checklistProgressMap = useMemo(() => {
    const map: Record<
      string,
      { completedCount: number; completed: boolean; percent: number }
    > = {};

    checklists.forEach((item) => {
      const completedCount = CHECKLIST_FIELDS.filter((field) =>
        Boolean(item[field])
      ).length;

      map[String(item.meeting_request_id)] = {
        completedCount,
        completed: completedCount === CHECKLIST_FIELDS.length,
        percent: Math.round((completedCount / CHECKLIST_FIELDS.length) * 100),
      };
    });

    return map;
  }, [checklists]);

  const totalRequests = requests.length;

  const confirmedCount = useMemo(() => {
    return requests.filter((item) => item.status === "confirmed").length;
  }, [requests]);

  const inProgressCount = useMemo(() => {
    return requests.filter((item) =>
      ["received", "reviewing", "slot_checking", "preparing"].includes(
        item.status || ""
      )
    ).length;
  }, [requests]);

  const completedChecklistCount = useMemo(() => {
    return checklists.filter((item) => {
      return CHECKLIST_FIELDS.every((field) => Boolean(item[field]));
    }).length;
  }, [checklists]);

  const incompleteChecklistCount = useMemo(() => {
    return checklists.filter((item) => {
      return !CHECKLIST_FIELDS.every((field) => Boolean(item[field]));
    }).length;
  }, [checklists]);

  const statusCounts = useMemo<StatusCountMap>(() => {
    return requests.reduce<StatusCountMap>((acc, item) => {
      const key = item.status || "unknown";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
  }, [requests]);

  const recentRequests = useMemo(() => {
    return requests.slice(0, 5);
  }, [requests]);

  const todaySchedule = useMemo(() => {
    const today = new Date();
    const todayKey = formatDateKey(today);

    return requests
      .map((request) => {
        const slot = slotMap[String(request.id)];
        if (!slot) return null;

        const slotDate = new Date(slot.start_datetime);
        if (formatDateKey(slotDate) !== todayKey) return null;

        return {
          ...request,
          slot,
          checklistProgress:
            checklistProgressMap[String(request.id)] || {
              completedCount: 0,
              completed: false,
              percent: 0,
            },
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        return (
          new Date(a!.slot.start_datetime).getTime() -
          new Date(b!.slot.start_datetime).getTime()
        );
      }) as Array<
      MeetingRequest & {
        slot: SelectedSlot;
        checklistProgress: {
          completedCount: number;
          completed: boolean;
          percent: number;
        };
      }
    >;
  }, [requests, slotMap, checklistProgressMap]);

  const thisWeekConfirmed = useMemo(() => {
    const today = new Date();
    const weekStart = startOfDay(getStartOfWeek(today));
    const weekEnd = endOfDay(addDays(weekStart, 6));

    return requests
      .map((request) => {
        const slot = slotMap[String(request.id)];
        if (!slot) return null;

        const slotStart = new Date(slot.start_datetime);
        const isInRange = slotStart >= weekStart && slotStart <= weekEnd;
        if (!isInRange) return null;

        return {
          ...request,
          slot,
          checklistProgress:
            checklistProgressMap[String(request.id)] || {
              completedCount: 0,
              completed: false,
              percent: 0,
            },
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        return (
          new Date(a!.slot.start_datetime).getTime() -
          new Date(b!.slot.start_datetime).getTime()
        );
      }) as Array<
      MeetingRequest & {
        slot: SelectedSlot;
        checklistProgress: {
          completedCount: number;
          completed: boolean;
          percent: number;
        };
      }
    >;
  }, [requests, slotMap, checklistProgressMap]);

  const riskRequests = useMemo(() => {
    return requests
      .map((request) => {
        const slot = slotMap[String(request.id)] || null;
        const checklist =
          checklists.find(
            (item) => String(item.meeting_request_id) === String(request.id)
          ) || null;

        const riskType = getRiskType({
          status: request.status,
          urgency_level: request.urgency_level,
          slot,
          checklist,
        });

        if (!riskType) return null;

        return {
          ...request,
          slot,
          checklistCount: getChecklistCount(checklist),
          riskType,
        };
      })
      .filter(Boolean) as Array<
      MeetingRequest & {
        slot: SelectedSlot | null;
        checklistCount: number;
        riskType: string;
      }
    >;
  }, [requests, slotMap, checklists]);

  const todayScheduleCount = todaySchedule.length;
  const thisWeekConfirmedCount = thisWeekConfirmed.length;
  const riskRequestCount = riskRequests.length;

  function getStatusLabel(status: string) {
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
function getRiskLabel(riskType: string) {
  switch (riskType) {
    case "today_unprepared":
      return "🚨 오늘 일정 준비 부족";
    case "urgent_no_slot":
      return "🔥 긴급 / 슬롯 없음";
    case "confirmed_unprepared":
      return "⚠️ 준비 부족";
    default:
      return "위험";
  }
}

  function formatDuration(minutes: number | null) {
    if (!minutes) return "-";
    if (minutes === 30) return "30분";
    if (minutes % 60 === 0) return `${minutes / 60}시간`;
    return `${Math.floor(minutes / 60)}시간 ${minutes % 60}분`;
  }

  function formatSlotDateTime(dateString: string) {
    const date = new Date(dateString);

    if (Number.isNaN(date.getTime())) return dateString;

    return date.toLocaleString("ko-KR", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function formatSlotTimeRange(startDateTime: string, endDateTime: string) {
    const start = new Date(startDateTime);
    const end = new Date(endDateTime);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return `${startDateTime} ~ ${endDateTime}`;
    }

    const datePart = start.toLocaleDateString("ko-KR", {
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
    });
    const startTime = start.toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
    });
    const endTime = end.toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
    });

    return `${datePart} ${startTime} ~ ${endTime}`;
  }

  function formatTimeOnly(dateString: string) {
    const date = new Date(dateString);

    if (Number.isNaN(date.getTime())) return dateString;

    return date.toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function getProgressBadgeClass(percent: number) {
    if (percent === 100) return "bg-green-100 text-green-700";
    if (percent >= 50) return "bg-yellow-100 text-yellow-700";
    return "bg-gray-100 text-gray-700";
  }

  function startOfDay(date: Date) {
    const next = new Date(date);
    next.setHours(0, 0, 0, 0);
    return next;
  }

  function endOfDay(date: Date) {
    const next = new Date(date);
    next.setHours(23, 59, 59, 999);
    return next;
  }

  function addDays(date: Date, days: number) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  }

  function getStartOfWeek(date: Date) {
    const next = new Date(date);
    const day = next.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    next.setDate(next.getDate() + diff);
    return next;
  }

  function formatDateKey(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 px-6 py-8">
        <div className="mx-auto max-w-6xl rounded-2xl bg-white p-6 shadow-sm">
          <p className="text-sm text-gray-600">대시보드 불러오는 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 px-6 py-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="mt-2 text-sm text-gray-600">
            전체 요청과 준비 현황을 한눈에 보는 화면이에요.
          </p>
        </div>

        {errorMessage && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <Link href="/meeting-requests" className="block">
            <DashboardCard
              title="전체 요청 수"
              value={String(totalRequests)}
              description="등록된 전체 미팅 요청"
            />
          </Link>

          <Link href="/meeting-requests?status=confirmed" className="block">
            <DashboardCard
              title="확정된 미팅 수"
              value={String(confirmedCount)}
              description="일정 확정된 미팅"
            />
          </Link>

          <Link href="/meeting-requests" className="block">
            <DashboardCard
              title="위험 요청 수"
              value={String(riskRequestCount)}
              description="긴급 미확정 / 준비 부족 요청"
            />
          </Link>

          <Link href="/execution-checklists?filter=incomplete" className="block">
            <DashboardCard
              title="미완료 체크리스트 수"
              value={String(incompleteChecklistCount)}
              description="아직 준비가 남은 체크리스트"
            />
          </Link>

          <Link href="/execution-checklists" className="block">
            <DashboardCard
              title="준비 완료 체크리스트"
              value={String(completedChecklistCount)}
              description="체크 항목 6개 완료"
            />
          </Link>

          <Link href="/meeting-requests?status=in_progress" className="block">
            <DashboardCard
              title="진행중 요청 수"
              value={String(inProgressCount)}
              description="접수 / 검토 / 슬롯 확인 / 실행 준비"
            />
          </Link>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">오늘 일정</h2>
                <p className="mt-1 text-sm text-gray-500">
                  시간순 타임라인 + 준비 상태
                </p>
              </div>
              <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700">
                {todayScheduleCount}건
              </span>
            </div>

            <div className="mt-5 space-y-4">
              {todaySchedule.length === 0 ? (
                <p className="text-sm text-gray-500">오늘 확정된 일정이 없어요.</p>
              ) : (
                todaySchedule.map((item) => (
                  <button
                    key={String(item.id)}
                    type="button"
                    onClick={() => {
                      router.push(`/meeting-requests/${item.id}`);
                    }}
                    className="w-full rounded-2xl border border-gray-200 px-4 py-4 text-left hover:bg-gray-50"
                  >
                    <div className="flex gap-4">
                      <div className="flex w-24 shrink-0 flex-col items-center">
                        <div className="text-sm font-semibold text-gray-900">
                          {formatTimeOnly(item.slot.start_datetime)}
                        </div>
                        <div className="my-2 h-full min-h-[48px] w-px bg-gray-200" />
                        <div className="text-xs text-gray-500">
                          {formatTimeOnly(item.slot.end_datetime)}
                        </div>
                      </div>

                      <div className="flex-1 rounded-xl bg-gray-50 p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-gray-900">{item.title}</p>
                          <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
                            {getStatusLabel(item.status || "unknown")}
                          </span>
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-medium ${getProgressBadgeClass(
                              item.checklistProgress.percent
                            )}`}
                          >
                            준비 {item.checklistProgress.completedCount}/6
                          </span>
                        </div>

                        <p className="mt-2 text-sm text-gray-600">
                          요청자: {item.requester_name || "-"}
                        </p>
                        <p className="mt-1 text-sm text-gray-600">
                          일정:{" "}
                          {formatSlotTimeRange(
                            item.slot.start_datetime,
                            item.slot.end_datetime
                          )}
                        </p>

                        <div className="mt-3">
                          <div className="mb-1 flex items-center justify-between text-xs text-gray-500">
                            <span>준비 진행도</span>
                            <span>{item.checklistProgress.percent}%</span>
                          </div>
                          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
                            <div
                              className="h-full rounded-full bg-gray-900 transition-all"
                              style={{ width: `${item.checklistProgress.percent}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </section>

          <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  이번 주 확정 미팅
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  월요일부터 일요일까지의 확정 슬롯 기준
                </p>
              </div>
              <span className="rounded-full bg-green-50 px-3 py-1 text-sm font-semibold text-green-700">
                {thisWeekConfirmedCount}건
              </span>
            </div>

            <div className="mt-4 space-y-3">
              {thisWeekConfirmed.length === 0 ? (
                <p className="text-sm text-gray-500">이번 주 확정 미팅이 없어요.</p>
              ) : (
                thisWeekConfirmed.map((item) => (
                  <button
                    key={String(item.id)}
                    type="button"
                    onClick={() => {
                      router.push(`/meeting-requests/${item.id}`);
                    }}
                    className="w-full rounded-xl border border-gray-200 px-4 py-4 text-left hover:bg-gray-50"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-medium text-gray-900">{item.title}</p>
                        <p className="mt-1 text-sm text-gray-600">
                          일정:{" "}
                          {formatSlotTimeRange(
                            item.slot.start_datetime,
                            item.slot.end_datetime
                          )}
                        </p>
                        <p className="mt-1 text-sm text-gray-600">
                          소요 시간: {formatDuration(item.duration_minutes)}
                        </p>
                        <p className="mt-1 text-sm text-gray-600">
                          요청자: {item.requester_name || "-"}
                        </p>
                        <p className="mt-1 text-sm text-gray-600">
                          준비 상태: {item.checklistProgress.completedCount}/6
                        </p>
                      </div>

                      <div className="flex flex-col items-end gap-2">
                        <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
                          확정 슬롯
                        </span>
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-medium ${getProgressBadgeClass(
                            item.checklistProgress.percent
                          )}`}
                        >
                          {item.checklistProgress.percent}%
                        </span>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </section>
        </div>

        <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">위험 요청</h2>
              <p className="mt-1 text-sm text-gray-500">
                긴급하지만 슬롯이 없거나, 준비가 부족한 요청
              </p>
            </div>
            <span className="rounded-full bg-red-50 px-3 py-1 text-sm font-semibold text-red-700">
              {riskRequestCount}건
            </span>
          </div>

          <div className="mt-4 space-y-3">
            {riskRequests.length === 0 ? (
              <p className="text-sm text-gray-500">현재 위험 요청이 없어요.</p>
            ) : (
              riskRequests.map((item) => (
                <button
                  key={String(item.id)}
                  type="button"
                  onClick={() => {
                    router.push(`/meeting-requests/${item.id}`);
                  }}
                  className="w-full rounded-xl border border-red-200 bg-red-50 px-4 py-4 text-left hover:bg-red-100"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium text-gray-900">{item.title}</p>
                      <p className="mt-1 text-sm text-gray-600">
                        요청자: {item.requester_name || "-"}
                      </p>
                      <p className="mt-1 text-sm text-gray-600">
                        상태: {getStatusLabel(item.status || "unknown")}
                      </p>
                      {item.slot && (
                        <p className="mt-1 text-sm text-gray-600">
                          확정 시간:{" "}
                          {formatSlotTimeRange(
                            item.slot.start_datetime,
                            item.slot.end_datetime
                          )}
                        </p>
                      )}
                      <p className="mt-1 text-sm text-gray-600">
                        준비 상태: {item.checklistCount}/6
                      </p>
                    </div>

                    <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-red-700 ring-1 ring-red-200">
                      {getRiskLabel(item.riskType)}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
            <h2 className="text-lg font-semibold text-gray-900">상태별 분포</h2>
            <div className="mt-4 space-y-3">
              {Object.keys(statusCounts).length === 0 ? (
                <p className="text-sm text-gray-500">표시할 데이터가 없어요.</p>
              ) : (
                Object.entries(statusCounts).map(([status, count]) => (
                  <div
                    key={status}
                    className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3"
                  >
                    <span className="text-sm text-gray-700">
                      {getStatusLabel(status)}
                    </span>
                    <span className="text-sm font-semibold text-gray-900">
                      {count}
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
            <h2 className="text-lg font-semibold text-gray-900">최근 요청</h2>
            <div className="mt-4 space-y-3">
              {recentRequests.length === 0 ? (
                <p className="text-sm text-gray-500">최근 요청이 없어요.</p>
              ) : (
                recentRequests.map((request) => (
                  <button
                    key={String(request.id)}
                    type="button"
                    onClick={() => {
                      router.push(`/meeting-requests/${request.id}`);
                    }}
                    className="w-full rounded-xl border border-gray-200 px-4 py-4 text-left hover:bg-gray-50"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-medium text-gray-900">{request.title}</p>
                        <p className="mt-1 text-sm text-gray-600">
                          요청자: {request.requester_name || "-"}
                        </p>
                        <p className="mt-1 text-sm text-gray-600">
                          희망 시기: {request.preferred_date_range || "-"}
                        </p>
                        <p className="mt-1 text-sm text-gray-600">
                          소요 시간: {formatDuration(request.duration_minutes)}
                        </p>
                        {slotMap[String(request.id)] && (
                          <p className="mt-1 text-sm text-gray-600">
                            확정 시간:{" "}
                            {formatSlotDateTime(
                              slotMap[String(request.id)].start_datetime
                            )}
                          </p>
                        )}
                      </div>

                      <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
                        {getStatusLabel(request.status || "unknown")}
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function DashboardCard({
  title,
  value,
  description,
}: {
  title: string;
  value: string;
  description: string;
}) {
  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100 transition hover:bg-gray-50">
      <p className="text-sm text-gray-500">{title}</p>
      <p className="mt-3 text-3xl font-bold text-gray-900">{value}</p>
      <p className="mt-2 text-xs text-gray-500">{description}</p>
    </section>
  );
}

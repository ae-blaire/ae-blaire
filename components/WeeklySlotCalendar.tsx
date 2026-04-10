"use client";

type WeeklyCalendarSlot = {
  id: string;
  start_datetime: string;
  end_datetime: string;
  date_key: string;
  isRepresentative: boolean;
  isAvailabilityBacked: boolean;
};

type WeeklyBusyItem = {
  email: string;
  busy: Array<{
    start: string;
    end: string;
  }>;
};

type WeeklySlotCalendarProps = {
  rangeStart: string | null;
  rangeEnd: string | null;
  slots: WeeklyCalendarSlot[];
  availabilityItems: WeeklyBusyItem[];
  selectedSlotId: string | null;
  onSelectSlot: (slotId: string) => void;
};

const CALENDAR_START_HOUR = 7;
const CALENDAR_END_HOUR = 20;
const ROW_HEIGHT = 28;
const TOTAL_MINUTES = (CALENDAR_END_HOUR - CALENDAR_START_HOUR) * 60;

function formatDateKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(
    value.getDate()
  ).padStart(2, "0")}`;
}

function formatWeekdayLabel(value: Date) {
  return value.toLocaleDateString("ko-KR", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
  });
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function getWeekStart(date: Date) {
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = addDays(date, diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function buildWeeks(rangeStart: string | null, rangeEnd: string | null) {
  if (!rangeStart || !rangeEnd) return [];

  const start = new Date(rangeStart);
  const end = new Date(rangeEnd);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return [];
  }

  const weeks = new Map<string, Date[]>();

  for (
    let current = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    current.getTime() <= end.getTime();
    current = addDays(current, 1)
  ) {
    const day = current.getDay();
    if (day === 0 || day === 6) continue;

    const weekStart = getWeekStart(current);
    const weekKey = formatDateKey(weekStart);
    const existing = weeks.get(weekKey) || [];
    existing.push(new Date(current));
    weeks.set(weekKey, existing);
  }

  return Array.from(weeks.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([weekKey, days]) => ({
      weekKey,
      days: days.sort((a, b) => a.getTime() - b.getTime()),
    }));
}

function getMinutesFromCalendarStart(value: string) {
  const date = new Date(value);
  const minutes = date.getHours() * 60 + date.getMinutes();
  return minutes - CALENDAR_START_HOUR * 60;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function mergeBusyRanges(
  availabilityItems: WeeklyBusyItem[],
  dateKey: string
): Array<{ start: string; end: string }> {
  const ranges = availabilityItems.flatMap((item) =>
    item.busy.filter((busy) => formatDateKey(new Date(busy.start)) === dateKey)
  );

  const sorted = ranges
    .map((range) => ({
      start: new Date(range.start).toISOString(),
      end: new Date(range.end).toISOString(),
    }))
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  if (sorted.length === 0) return [];

  const merged: Array<{ start: string; end: string }> = [sorted[0]];

  for (let index = 1; index < sorted.length; index += 1) {
    const current = sorted[index];
    const last = merged[merged.length - 1];

    if (new Date(current.start).getTime() <= new Date(last.end).getTime()) {
      if (new Date(current.end).getTime() > new Date(last.end).getTime()) {
        last.end = current.end;
      }
      continue;
    }

    merged.push(current);
  }

  return merged;
}

function buildTimeLabels() {
  const labels: Array<{ label: string; top: number }> = [];

  for (let hour = CALENDAR_START_HOUR; hour <= CALENDAR_END_HOUR; hour += 1) {
    const top = (hour - CALENDAR_START_HOUR) * 60;
    labels.push({
      label: `${String(hour).padStart(2, "0")}:00`,
      top,
    });
  }

  return labels;
}

export default function WeeklySlotCalendar({
  rangeStart,
  rangeEnd,
  slots,
  availabilityItems,
  selectedSlotId,
  onSelectSlot,
}: WeeklySlotCalendarProps) {
  const weeks = buildWeeks(rangeStart, rangeEnd);
  const timeLabels = buildTimeLabels();
  const totalHeight = TOTAL_MINUTES / 30 * ROW_HEIGHT;
  const hasAvailability = availabilityItems.length > 0;

  if (weeks.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-4 text-sm text-gray-600">
        주간 캘린더를 그릴 수 있는 희망 시기 정보가 아직 없어요.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {!hasAvailability && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          availability 데이터가 아직 없어 추천 슬롯을 전원 공통 가능으로 확정하지 않았어요.
          지금 그리드는 참고용 시간 축으로만 보여줘요.
        </div>
      )}

      {weeks.map((week) => (
        <div
          key={week.weekKey}
          className="overflow-x-auto rounded-2xl border border-gray-200 bg-white"
        >
          <div
            className="grid min-w-[720px]"
            style={{
              gridTemplateColumns: `72px repeat(${week.days.length}, minmax(160px, 1fr))`,
            }}
          >
            <div className="border-b border-gray-200 bg-gray-50 px-3 py-3 text-xs font-medium text-gray-500">
              시간
            </div>

            {week.days.map((day) => (
              <div
                key={formatDateKey(day)}
                className="border-b border-l border-gray-200 bg-gray-50 px-3 py-3 text-sm font-semibold text-gray-900"
              >
                {formatWeekdayLabel(day)}
              </div>
            ))}

            <div
              className="relative bg-white"
              style={{ height: `${totalHeight}px` }}
            >
              {timeLabels.map((item) => (
                <div
                  key={item.label}
                  className="absolute inset-x-0 -translate-y-1/2 px-2 text-[11px] text-gray-400"
                  style={{ top: `${(item.top / TOTAL_MINUTES) * totalHeight}px` }}
                >
                  {item.label}
                </div>
              ))}
            </div>

            {week.days.map((day) => {
              const dateKey = formatDateKey(day);
              const mergedBusyRanges = mergeBusyRanges(availabilityItems, dateKey);
              const daySlots = slots
                .filter((slot) => slot.date_key === dateKey)
                .sort(
                  (a, b) =>
                    new Date(a.start_datetime).getTime() -
                    new Date(b.start_datetime).getTime()
                );

              return (
                <div
                  key={dateKey}
                  className="relative border-l border-gray-200 bg-white"
                  style={{ height: `${totalHeight}px` }}
                >
                  {Array.from({ length: TOTAL_MINUTES / 30 }).map((_, index) => (
                    <div
                      key={`${dateKey}-${index}`}
                      className="absolute inset-x-0 border-t border-gray-100"
                      style={{ top: `${index * ROW_HEIGHT}px`, height: `${ROW_HEIGHT}px` }}
                    />
                  ))}

                  {mergedBusyRanges.map((busy, index) => {
                    const busyStart = clamp(getMinutesFromCalendarStart(busy.start), 0, TOTAL_MINUTES);
                    const busyEnd = clamp(getMinutesFromCalendarStart(busy.end), 0, TOTAL_MINUTES);
                    const height = Math.max(((busyEnd - busyStart) / 30) * ROW_HEIGHT, ROW_HEIGHT);

                    return (
                      <div
                        key={`${dateKey}-busy-${index}`}
                        className="absolute left-1 right-1 rounded-lg border border-red-200 bg-red-100/80 px-2 py-1 text-[11px] font-medium text-red-700"
                        style={{
                          top: `${(busyStart / 30) * ROW_HEIGHT}px`,
                          height: `${height}px`,
                        }}
                      >
                        busy
                      </div>
                    );
                  })}

                  {daySlots.map((slot) => {
                    const slotStart = clamp(
                      getMinutesFromCalendarStart(slot.start_datetime),
                      0,
                      TOTAL_MINUTES
                    );
                    const slotEnd = clamp(
                      getMinutesFromCalendarStart(slot.end_datetime),
                      0,
                      TOTAL_MINUTES
                    );
                    const height = Math.max(((slotEnd - slotStart) / 30) * ROW_HEIGHT, ROW_HEIGHT);
                    const isSelected = selectedSlotId === slot.id;

                    return (
                      <button
                        key={slot.id}
                        type="button"
                        onClick={() => onSelectSlot(slot.id)}
                        className={[
                          "absolute left-1 right-1 overflow-hidden rounded-xl border px-2 py-1 text-left shadow-sm transition",
                          isSelected
                            ? "z-20 border-indigo-700 bg-indigo-700 text-white ring-2 ring-indigo-300"
                            : slot.isRepresentative
                            ? "z-10 border-lime-400 bg-lime-100 text-lime-950 ring-1 ring-lime-200 hover:bg-lime-200"
                            : "z-10 border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100",
                        ].join(" ")}
                        style={{
                          top: `${(slotStart / 30) * ROW_HEIGHT}px`,
                          height: `${height}px`,
                        }}
                        title={`${new Date(slot.start_datetime).toLocaleTimeString("ko-KR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })} ~ ${new Date(slot.end_datetime).toLocaleTimeString("ko-KR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}`}
                      >
                        <div className="text-[11px] font-semibold">
                          {new Date(slot.start_datetime).toLocaleTimeString("ko-KR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}{" "}
                          ~{" "}
                          {new Date(slot.end_datetime).toLocaleTimeString("ko-KR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

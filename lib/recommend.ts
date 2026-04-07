type MeetingRequestLike = {
  importance_level?: string | number | null;
  urgency_level?: string | number | null;
  preferred_date_range?: string | null;
  duration_minutes?: number | null;
};

type SlotLike = {
  id?: string | number;
  start_datetime?: string | null;
  end_datetime?: string | null;
  proposed_by?: string | null;
  note?: string | null;
};

export type SlotRecommendationResult<T extends SlotLike = SlotLike> = {
  slot: T;
  score: number;
  badges: string[];
  reasons: string[];
};

function normalizeLevel(value: string | number | null | undefined) {
  if (typeof value === "number") return value;

  if (typeof value === "string") {
    const trimmed = value.trim().toLowerCase();
    if (!trimmed) return 0;

    const numeric = Number(trimmed);
    if (!Number.isNaN(numeric)) return numeric;

    if (["low", "낮음", "하"].includes(trimmed)) return 1;
    if (["medium", "보통", "중", "mid"].includes(trimmed)) return 3;
    if (["high", "높음", "상"].includes(trimmed)) return 5;
    if (["urgent", "긴급", "최상", "critical"].includes(trimmed)) return 5;
  }

  return 0;
}

function getPreferredDateFit(preferredDateRange?: string | null, slotStart?: string | null) {
  if (!preferredDateRange || !slotStart) return 0.5;

  const preferred = preferredDateRange.trim();
  const start = new Date(slotStart);
  if (Number.isNaN(start.getTime())) return 0.5;

  const slotDate = start.toISOString().slice(0, 10);

  if (preferred.includes(slotDate)) return 1;

  const normalizedPreferred = preferred.replace(/\s/g, "");
  const normalizedSlotDate = slotDate.replace(/\s/g, "");
  if (normalizedPreferred.includes(normalizedSlotDate)) return 1;

  return 0.4;
}

function getSoonnessScore(slotStart?: string | null) {
  if (!slotStart) return 0.3;

  const now = new Date();
  const slot = new Date(slotStart);
  if (Number.isNaN(slot.getTime())) return 0.3;

  const diffMs = slot.getTime() - now.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (diffDays < 0) return 0.1;
  if (diffDays <= 1) return 1;
  if (diffDays <= 3) return 0.8;
  if (diffDays <= 7) return 0.6;
  return 0.3;
}

function getBusinessHourScore(slotStart?: string | null) {
  if (!slotStart) return 0.5;

  const date = new Date(slotStart);
  if (Number.isNaN(date.getTime())) return 0.5;

  const hour = date.getHours();

  if (hour >= 13 && hour < 17) return 1;
  if (hour >= 10 && hour < 18) return 0.7;
  return 0.3;
}

export function getSlotScore(request: MeetingRequestLike, slot: SlotLike) {
  const urgency = normalizeLevel(request.urgency_level);
  const importance = normalizeLevel(request.importance_level);
  const preferredDateFit = getPreferredDateFit(
    request.preferred_date_range,
    slot.start_datetime
  );

  const urgencyScore = (urgency / 5) * 0.5;
  const importanceScore = (importance / 5) * 0.3;
  const dateFitScore = preferredDateFit * 0.2;

  return Number((urgencyScore + importanceScore + dateFitScore).toFixed(3));
}

export function getSlotRecommendationBadges(request: MeetingRequestLike, slot: SlotLike) {
  const badges: string[] = [];

  const preferredDateFit = getPreferredDateFit(
    request.preferred_date_range,
    slot.start_datetime
  );
  const businessHourScore = getBusinessHourScore(slot.start_datetime);
  const soonnessScore = getSoonnessScore(slot.start_datetime);

  if (preferredDateFit >= 1) badges.push("희망 시기 일치");
  if (businessHourScore >= 1) badges.push("주요 미팅 시간");
  if (soonnessScore >= 0.8) badges.push("빠른 대응 가능");

  return badges;
}

export function getSlotRecommendationReasons(request: MeetingRequestLike, slot: SlotLike) {
  const reasons: string[] = [];

  const urgency = normalizeLevel(request.urgency_level);
  const importance = normalizeLevel(request.importance_level);
  const preferredDateFit = getPreferredDateFit(
    request.preferred_date_range,
    slot.start_datetime
  );
  const businessHourScore = getBusinessHourScore(slot.start_datetime);

  if (urgency >= 4) reasons.push("긴급도가 높아서 빠른 배치가 중요해요.");
  if (importance >= 4) reasons.push("중요도가 높아서 우선 검토 대상이에요.");
  if (preferredDateFit >= 1) reasons.push("희망 시기와 정확히 맞아요.");
  if (businessHourScore >= 1) reasons.push("기본 미팅 가능 시간대에 들어와요.");

  if (reasons.length === 0) {
    reasons.push("현재 조건 기준으로 무난한 후보예요.");
  }

  return reasons;
}

export function rankSlots<T extends SlotLike>(
  request: MeetingRequestLike,
  slots: T[]
): SlotRecommendationResult<T>[] {
  return [...slots]
    .map((slot) => ({
      slot,
      score: getSlotScore(request, slot),
      badges: getSlotRecommendationBadges(request, slot),
      reasons: getSlotRecommendationReasons(request, slot),
    }))
    .sort((a, b) => b.score - a.score);
}

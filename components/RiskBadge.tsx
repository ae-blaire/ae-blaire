import type { RiskType } from "@/lib/risk";

const badgeMap: Record<Exclude<RiskType, null>, { label: string; className: string }> = {
  urgent_no_slot: {
    label: "🔥 긴급·미확정",
    className: "border-red-200 bg-red-50 text-red-700",
  },
  confirmed_unprepared: {
    label: "🚨 준비 부족",
    className: "border-orange-200 bg-orange-50 text-orange-700",
  },
  today_unprepared: {
    label: "⚠️ 오늘 리스크",
    className: "border-yellow-200 bg-yellow-50 text-yellow-700",
  },
};

export default function RiskBadge({
  riskType,
}: {
  riskType: RiskType | undefined;
}) {
  if (!riskType) return null;

  const badge = badgeMap[riskType];
  if (!badge) return null;

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-1 text-xs font-medium ${badge.className}`}
    >
      {badge.label}
    </span>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import ContactSearchInput from "@/components/ContactSearchInput";
import {
  buildParticipantsStorageValueFromEmailMap,
  getParticipantNameKey,
  parseParticipantNamesText,
  pruneParticipantEmailMap,
} from "@/lib/participants";

type FormData = {
  title: string;
  requester: string;
  attendees: string;
  hasExternal: boolean;
  startDate: string;
  endDate: string;
  durationMinutes: number;
  importance: string;
  urgency: string;
  memo: string;
};

type ContactsSearchResponse = {
  error?: string;
  results?: Array<{
    name: string;
    email: string;
    organization: string | null;
  }>;
};

function normalizeUrgencyLevel(value: string) {
  switch (value) {
    case "normal":
      return "medium";
    case "asap":
      return "urgent";
    default:
      return value;
  }
}

const initialForm: FormData = {
  title: "",
  requester: "",
  attendees: "",
  hasExternal: false,
  startDate: "",
  endDate: "",
  durationMinutes: 60,
  importance: "medium",
  urgency: "normal",
  memo: "",
};

export default function NewRequestPage() {
  const [form, setForm] = useState<FormData>(initialForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [participantEmailMap, setParticipantEmailMap] = useState<Record<string, string>>(
    {}
  );
  const router = useRouter();

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target;

    if (type === "checkbox") {
      const checked = (e.target as HTMLInputElement).checked;
      setForm((prev) => ({ ...prev, [name]: checked }));
      return;
    }

    if (name === "durationMinutes") {
      setForm((prev) => ({ ...prev, [name]: Number(value) }));
      return;
    }

    if (name === "attendees") {
      setForm((prev) => ({ ...prev, [name]: value }));
      setParticipantEmailMap((prev) => pruneParticipantEmailMap(value, prev));
      return;
    }

    setForm((prev) => ({ ...prev, [name]: value }));
  };

  async function handleAutoResolveParticipants(displayText: string) {
    const names = parseParticipantNamesText(displayText);
    const nextEmailMap = pruneParticipantEmailMap(displayText, participantEmailMap);

    for (const name of names) {
      const key = getParticipantNameKey(name);

      if (nextEmailMap[key]) continue;

      try {
        const response = await fetch(
          `/api/contacts/search?query=${encodeURIComponent(name)}`
        );
        const result = (await response.json()) as ContactsSearchResponse;

        if (!response.ok || !result.results) continue;

        if (result.results.length === 1) {
          const candidate = result.results[0];
          nextEmailMap[key] = candidate.email.trim().toLowerCase();
        }
      } catch (e) {
        console.error("auto resolve error", e);
      }
    }

    setParticipantEmailMap(nextEmailMap);
    return nextEmailMap;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    if (form.startDate && form.endDate && form.startDate > form.endDate) {
      setError("종료일은 시작일보다 빠를 수 없어요.");
      setLoading(false);
      return;
    }

    const normalizedAttendees = parseParticipantNamesText(form.attendees).join(", ");
    const resolvedParticipantEmailMap = await handleAutoResolveParticipants(
      normalizedAttendees
    );

    const preferredDateRange =
      form.startDate && form.endDate
        ? `${form.startDate} ~ ${form.endDate}`
        : form.startDate
        ? form.startDate
        : form.endDate
        ? form.endDate
        : null;

    const memo = form.memo.trim() || null;
    const importanceLevel = form.importance;
    const urgencyLevel = normalizeUrgencyLevel(form.urgency);

    const participantsValue = buildParticipantsStorageValueFromEmailMap({
      displayText: normalizedAttendees,
      emailMap: resolvedParticipantEmailMap,
    });

    const payload = {
      title: form.title.trim(),
      requester_name: form.requester.trim(),
      participants_text: participantsValue,
      external_flag: form.hasExternal,
      preferred_date_range: preferredDateRange,
      duration_minutes: form.durationMinutes,
      importance: importanceLevel,
      urgency: urgencyLevel,
      planning_notes: memo,
      background_notes: null,
      memo,
      status: "received",
    };

    const result = await supabase
      .from("meeting_requests")
      .insert(payload)
      .select();

    setLoading(false);

    if (result.error) {
      setError(
        result.error.message ||
          result.error.details ||
          result.error.hint ||
          "저장 중 오류가 발생했어요."
      );
      return;
    }

    router.push("/meeting-requests");
  };

  const handleReset = () => {
    setForm(initialForm);
    setError("");
    setParticipantEmailMap({});
  };

  function handleSelectParticipant(contact: { name: string; email: string }) {
    const normalizedName = parseParticipantNamesText(contact.name)[0];
    if (!normalizedName) return;

    setForm((prev) => {
      const currentNames = parseParticipantNamesText(prev.attendees);
      const candidateKey = getParticipantNameKey(normalizedName);

      if (currentNames.some((name) => getParticipantNameKey(name) === candidateKey)) {
        return prev;
      }

      return {
        ...prev,
        attendees:
          currentNames.length > 0
            ? `${currentNames.join(", ")}, ${normalizedName}`
            : normalizedName,
      };
    });

    setParticipantEmailMap((prev) => ({
      ...prev,
      [getParticipantNameKey(normalizedName)]: contact.email.trim().toLowerCase(),
    }));
    setShowSearch(false);
  }

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-800">New Request</h2>
        <p className="mt-1 text-gray-500">새로운 미팅 요청을 등록해요</p>
      </div>

      <div className="max-w-2xl rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              미팅 제목 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="title"
              value={form.title}
              onChange={handleChange}
              required
              placeholder="예: Q2 전략 방향 논의"
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              요청자 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="requester"
              value={form.requester}
              onChange={handleChange}
              required
              placeholder="예: 홍길동"
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              참석자
            </label>
            <input
              type="text"
              name="attendees"
              value={form.attendees}
              onChange={handleChange}
              onBlur={() => {
                void handleAutoResolveParticipants(form.attendees);
              }}
              placeholder="예: 김민준, 이서연"
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="mt-1 text-xs text-gray-400">
              여러 명이면 쉼표로 구분해서 적어주세요. 이메일은 뒤에서 자동으로 보완돼요.
            </p>
            <button
              type="button"
              onClick={() => setShowSearch((prev) => !prev)}
              className="mt-2 text-xs text-gray-500 underline"
            >
              {showSearch ? "검색 닫기" : "🔍 검색으로 추가"}
            </button>
            {showSearch && (
              <div className="mt-3">
                <ContactSearchInput onSelect={handleSelectParticipant} />
              </div>
            )}
          </div>

          <div>
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                name="hasExternal"
                checked={form.hasExternal}
                onChange={handleChange}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm">외부 참석자 있음</span>
            </label>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              희망 시기
            </label>

            <div className="grid grid-cols-2 gap-3">
              <input
                type="date"
                name="startDate"
                value={form.startDate}
                onChange={handleChange}
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />

              <input
                type="date"
                name="endDate"
                value={form.endDate}
                onChange={handleChange}
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <p className="mt-1 text-xs text-gray-400">
              시작일 ~ 종료일 형태로 선택하세요
            </p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              미팅 소요 시간
            </label>
            <select
              name="durationMinutes"
              value={form.durationMinutes}
              onChange={handleChange}
              className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value={30}>30분</option>
              <option value={60}>1시간</option>
              <option value={90}>1시간 30분</option>
              <option value={120}>2시간</option>
            </select>
            <p className="mt-1 text-xs text-gray-400">
              30분 단위로 선택하세요
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                중요도
              </label>
              <select
                name="importance"
                value={form.importance}
                onChange={handleChange}
                className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
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
                name="urgency"
                value={form.urgency}
                onChange={handleChange}
                className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="low">여유 있음</option>
                <option value="normal">보통</option>
                <option value="urgent">급함</option>
                <option value="asap">즉시 필요</option>
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              메모
            </label>
            <textarea
              name="memo"
              value={form.memo}
              onChange={handleChange}
              rows={3}
              placeholder="추가로 전달할 내용을 적어주세요"
              className="w-full resize-none rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleReset}
              disabled={loading}
              className="flex-1 rounded-lg border border-gray-300 py-3 text-sm disabled:opacity-50"
            >
              초기화
            </button>

            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-lg bg-blue-600 py-3 text-sm text-white disabled:opacity-50"
            >
              {loading ? "저장 중..." : "요청 저장하기"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

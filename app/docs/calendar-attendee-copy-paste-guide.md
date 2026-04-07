# Google Calendar 참석자 복사 기능 반영용 코드

아래 내용대로 `app/meeting-requests/[id]/page.tsx`에 복붙하면 됩니다.

---

## 1) `buildCalendarCopyMessage()` 함수 아래에 추가할 코드

```ts
function buildAttendeeEmailsCopyText() {
  return getParticipantEmails()
    .filter(Boolean)
    .join("; ");
}

async function handleCopyAttendeeEmails() {
  try {
    await navigator.clipboard.writeText(buildAttendeeEmailsCopyText());
    toast.success("참석자 이메일을 복사했어요.");
  } catch {
    toast.error("참석자 이메일 복사에 실패했어요.");
  }
}
```

---

## 2) `buildCalendarEventPayload()` 함수 전체 교체

기존의

```ts
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
```

이 부분을 아래 코드로 통째로 바꿔주세요.

```ts
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
    attendees: getParticipantEmails()
      .filter(Boolean)
      .map((email) => ({ email })),
  };
}
```

---

## 3) 캘린더 미리보기 UI에 복사용 이메일 박스 추가

`복사용 안내 문구` 박스 바로 아래에 이 블록을 추가해주세요.

```tsx
<div className="rounded-xl bg-gray-50 p-4">
  <p className="text-xs font-medium text-gray-500">참석자 이메일 복사용</p>
  <pre className="mt-2 whitespace-pre-wrap text-sm text-gray-900">
    {buildAttendeeEmailsCopyText() || "-"}
  </pre>
</div>
```

---

## 4) 버튼 영역에 `참석자 이메일 복사` 버튼 추가

지금 `안내 문구 복사`, `Google Calendar에서 열기`, `API route 테스트` 버튼이 있는 부분에 아래 버튼을 함께 추가해주세요.

```tsx
<button
  type="button"
  onClick={handleCopyAttendeeEmails}
  className="rounded-xl bg-gray-200 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-300"
>
  참석자 이메일 복사
</button>
```

---

## 5) 최종 버튼 영역 예시

참고용으로 버튼 영역 전체 예시는 아래와 같습니다.

```tsx
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
```

---

## 적용 후 기대 결과

- `참석자 이메일 복사` 버튼으로 `a@a.com; b@b.com` 형태 복사 가능
- 오른쪽 참석자 칸에 직접 붙여넣기 가능
- `API route 테스트` 쪽은 attendees 배열이 들어가도록 준비됨
- 이후 API route가 실제 생성까지 연결되면 오른쪽 참석자 영역 자동 반영 가능

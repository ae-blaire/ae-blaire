# 다음 단계 작업 지시서

아래 내용을 다음 채팅이나 작업 메모에 그대로 복붙해서 이어가면 된다.

---

## 현재 상태 요약
- 제품은 요청 관리 + 슬롯 운영 + 체크리스트 + 리스크 감지 + Google Calendar read-only + Google People search까지 연결된 상태다.
- `app/meeting-requests/[id]/page.tsx` 기준으로 요청 수정/삭제, 참가자 검색, availability 조회, 체크리스트 상태 전이, 캘린더 미리보기, 슬롯 후보 연결까지 구현되어 있다.
- 다음 단계는 "새로운 후보 생성"보다 "기존 슬롯 후보를 필터링하고 재정렬해서 역추천"하는 작업이다.

---

## 이번에 해야 할 다음 작업

### 목표
희망 시기 안에서, 주중 오전 7시~오후 8시 범위에 들어가는 공통 가능 슬롯만 먼저 추리고,
그 후보를 대상으로 슬롯 후보를 역추천하는 기능을 붙인다.

---

## 구현 작업 순서

### 1. 슬롯 후보 불러오기 구조 확인
- `SlotCandidatesSection`에서 현재 사용하는 슬롯 목록 데이터 구조 확인
- 최소 필요 필드:
  - `id`
  - `start_datetime`
  - `end_datetime`
  - `proposed_by`
  - `note`
  - `is_selected`

### 2. 희망 시기 파싱 함수 만들기
- `preferred_date_range` 문자열을 파싱해서 시작일/종료일로 변환하는 함수 추가
- 파싱 실패 시에는 필터를 적용하지 않고 전체 통과 처리
- 권장 파일 위치:
  - `lib/date-range.ts` 또는
  - `lib/slot-recommendation.ts`

예상 반환 형태:
```ts
{
  start: Date | null;
  end: Date | null;
}
```

### 3. 추천 필터 함수 만들기
아래 조건을 통과하는 슬롯만 추천 후보로 본다.

#### 필수 조건
- 주중만 허용 (`Mon` ~ `Fri`)
- 시작 시간이 오전 7시 이상
- 종료 시간이 오후 8시 이하
- `preferred_date_range` 범위 안
- `availabilityItems` 기준으로 참석자 공통 가능

권장 함수 예시:
```ts
isWeekdaySlot(slot)
isWithinBusinessHours(slot)
isWithinPreferredRange(slot, preferredDateRange)
isCommonAvailable(slot, availabilityItems)
getRecommendedSlots(slots, availabilityItems, preferredDateRange)
```

### 4. availability 충돌 판정 로직 추가
- 각 참석자의 `busy` 구간과 슬롯 시간이 겹치는지 검사
- 한 명이라도 겹치면 `공통 가능` 후보에서 제외
- 모든 참석자가 충돌이 없을 때만 추천 후보로 포함

겹침 판정 기준:
```ts
slotStart < busyEnd && slotEnd > busyStart
```

### 5. Request Detail에서 추천 슬롯 계산
파일:
- `app/meeting-requests/[id]/page.tsx`

추가 작업:
- 슬롯 후보 목록을 받아온 뒤
- `availabilityItems`
- `request.preferred_date_range`
를 기준으로 `recommendedSlots` 계산

### 6. SlotCandidatesSection에 추천 결과 전달
현재 props:
```tsx
<SlotCandidatesSection
  meetingRequestId={requestId}
  onSlotsChanged={fetchDetail}
  availabilityItems={availabilityItems}
/>
```

변경 목표:
```tsx
<SlotCandidatesSection
  meetingRequestId={requestId}
  onSlotsChanged={fetchDetail}
  availabilityItems={availabilityItems}
  recommendedSlots={recommendedSlots}
/>
```

### 7. UI 표시 방식 정리
슬롯 후보 영역을 두 덩어리로 나눈다.

#### 상단
- 추천 슬롯
- 정렬 우선 표시
- 배지 예시:
  - `추천`
  - `공통 가능`
  - `희망 시기 충족`

#### 하단
- 전체 슬롯 후보
- 기존 후보 전체는 유지하되, 추천 아닌 항목은 아래에 둔다

### 8. 추천 이유 문구 추가
추천 슬롯 카드에 아래 같은 이유를 함께 보여준다.

예시:
- 전원 availability 충돌 없음
- 주중 운영 시간대 충족
- 요청 희망 시기 충족

### 9. 예외 처리
다음 경우 UX 메시지 필요
- 희망 시기 파싱 실패
- availability 미조회 상태
- 공통 가능 슬롯 없음
- 슬롯 후보 자체가 없음

예시 문구:
- "공통 가능 슬롯이 없어 기존 후보만 표시해요."
- "희망 시기를 해석하지 못해 시간 조건만 기준으로 추천했어요."

---

## 이번 단계 완료 기준
아래가 되면 이번 작업 완료다.

- 사용자가 Availability 조회를 실행한다.
- 시스템이 기존 슬롯 후보 중에서
  - 주중
  - 07:00~20:00
  - 희망 시기 내
  - 참석자 공통 가능
  인 슬롯만 골라낸다.
- 추천 슬롯이 SlotCandidatesSection 상단에 별도 표시된다.
- 추천 이유가 사용자에게 보인다.

---

## 다음 단계 후보
이번 작업 다음에는 아래 순서 추천.

1. 추천 점수화
   - importance
   - urgency
   - 외부 참석 여부
   - 임원 참석 필요 여부

2. 임원 캘린더 운영 원칙 반영
   - 13:00~17:00 선호
   - 50분 운영
   - anchor meeting 보호

3. 자동 슬롯 생성
   - 단순 필터를 넘어 실제 추천 후보를 시스템이 먼저 생성

4. Calendar Event Creation 고도화
   - 참석자 자동 초대
   - sendUpdates 적용
   - 회사 계정 정책 대응

---

## 참고 파일
- 현재 작업 기준 파일: `app/meeting-requests/[id]/page.tsx`
- 업로드 원본 파일 기준으로 작업 이어가기

# Issue 004 — slot selection atomicity

## 메타
- 상태: done
- 우선순위: P1
- 범위: slot selection logic
- 생성: 2026-04-09

## 증상
하나의 미팅 요청에 대해 여러 슬롯이 동시에 선택될 가능성이 있음

## 기대 동작
하나의 미팅 요청에는 항상 하나의 슬롯만 선택되어야 함

────────────────────────

## Claude 분석
- 기존 슬롯 선택 로직이 "전체 해제 → 하나 선택" 2단계 쿼리로 동작함
- 두 쿼리는 별도 네트워크 요청이라 경쟁 조건 발생 가능
- 동시에 요청이 들어올 경우 복수 슬롯이 `is_selected = true` 상태가 될 수 있음
- 동일 패턴이 다음 두 위치에 존재:
  - `components/slot-candidates-section.tsx`
  - `app/meeting-requests/[id]/page.tsx`
- DB 레벨에서 selected slot 1개만 허용하는 제약 없음

### → Codex 요청문
문제:
슬롯 선택이 "전체 해제 → 하나 선택" 2단계 DB 쿼리로 처리됨.
경쟁 조건 때문에 복수 슬롯이 동시에 is_selected = true가 될 수 있음.

수정 사항:
1. Supabase SQL Editor에서 아래 RPC 함수를 생성:

CREATE OR REPLACE FUNCTION select_meeting_slot(
  p_meeting_request_id UUID,
  p_slot_id UUID
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE meeting_slot_candidates
    SET is_selected = false
    WHERE meeting_request_id = p_meeting_request_id;

  UPDATE meeting_slot_candidates
    SET is_selected = true
    WHERE id = p_slot_id
      AND meeting_request_id = p_meeting_request_id;
END;
$$;

2. `components/slot-candidates-section.tsx`의 `handleSelectSlot`을
   2단계 update 대신 `supabase.rpc("select_meeting_slot", ...)` 단일 호출로 교체

3. `app/meeting-requests/[id]/page.tsx`의 자동 슬롯 확정 로직에도
   동일한 RPC 적용

제약:
- 에러 처리 로직은 현재 방식 유지
- `fetchSlots()`, `onSlotsChanged()` 호출 순서 유지
- 다른 기능 건드리지 말 것
- build 통과 필수

────────────────────────

## Codex 수정
- `components/slot-candidates-section.tsx`
  - `handleSelectSlot()`의 기존 2단계 update 제거
  - `supabase.rpc("select_meeting_slot", ...)` 단일 호출로 교체
  - 기존 에러 처리, `fetchSlots()`, `onSlotsChanged()` 호출 순서 유지

- `app/meeting-requests/[id]/page.tsx`
  - 자동 슬롯 확정 로직도 동일한 RPC 호출 방식으로 변경
  - 기존 슬롯이 있으면 메타 정보(`proposed_by`, `note`)만 update 후 RPC로 선택 처리
  - 새 슬롯이면 `is_selected: false`로 insert 후 RPC로 선택 처리
  - 상태 변경, checklist 생성, `fetchDetail()` 흐름 유지

- Supabase SQL Editor
  - `select_meeting_slot` RPC 함수 생성

- 검증
  - `npm run build` 통과
  - eslint 실패는 기존 `react-hooks/set-state-in-effect` 이슈로 확인 (이번 변경과 무관)

────────────────────────

## Claude 검수
- `handleSelectSlot`이 단일 RPC 호출로 변경되어 경쟁 조건이 구조적으로 제거됨
- 자동 슬롯 확정 로직도 동일한 RPC를 사용하여 두 경로 모두 일관성 확보
- 기존 상태 변경, 체크리스트 생성, fetch 흐름 등 영향 없음
- 신규 슬롯 insert 후 RPC로 선택 처리하는 순서도 적절함

- 추가 확인 사항:
  - RLS 정책에 따라 RPC 내부 UPDATE 권한 문제 가능성 있음 → 운영 전 확인 권장
  - Partial Unique Index는 미적용 상태이나 현재 이슈 완료에는 영향 없음

- 결론:
  - 비원자적 2단계 update 구조가 제거되고
  - 단일 트랜잭션 RPC 방식으로 전환되어
  - 경쟁 조건 문제가 해결됨

────────────────────────

## 완료
- 종료 유형: fixed
- 요약: 슬롯 선택 로직을 RPC 기반 단일 트랜잭션으로 변경하여 복수 슬롯 선택 경쟁 조건을 해결함
# Issue 009 — participant input ux direction

## 메타
- 상태: done
- 우선순위: P1
- 범위: new request / edit participant input UX
- 생성: 2026-04-09

## 증상
현재 참석자 입력은 두 가지 방식이 혼재되어 있음

1. `ContactSearchInput` 검색 기반 추가
2. textarea/input에 이름을 콤마(쉼표)로 입력

기존에는 검색 UI가 메인처럼 보이는 위치에 있어
실제 사용 흐름인 “콤마 입력 → 자동 해석”보다 검색 입력이 더 중심처럼 보였음

## 기대 동작
참석자 입력의 메인 흐름은 콤마 기반 입력으로 유지하고,
검색은 예외적인 보조 흐름으로만 동작해야 함

즉,
- 기본 입력은 참석자 input / textarea
- 검색 UI는 필요할 때만 펼쳐지는 보조 기능
- 기존 저장 및 자동 해석 로직은 유지

────────────────────────

## Claude 분석
- 현재 참석자 입력은 `ContactSearchInput`과 콤마 입력이 혼재되어 있음
- 실제 핵심 흐름은 콤마 입력 후 자동 해석이고, 검색은 예외 처리용 보조 기능에 가까움
- 검색을 완전히 제거하면 동명이인 선택이나 이메일 직접 확인이 어려워짐
- 따라서 유지/제거가 아니라 **기본 접힘(collapse by default)** 구조가 적절함

- `new-request/page.tsx`
  - 현재 검색 input이 위에 있어 메인 입력처럼 보임
  - attendees input을 메인으로 두고, 검색은 아래에서 토글로 여는 구조가 적절함

- `app/meeting-requests/[id]/page.tsx`
  - textarea가 위에 있는 것은 맞지만 검색 영역이 항상 펼쳐져 있음
  - 동일하게 토글 구조로 바꾸는 것이 적절함

### → Codex 요청문
파일 1: app/new-request/page.tsx

변경 사항:
1. 기존 ContactSearchInput 블록 제거
2. attendees input 아래에 다음 추가:
   - `showSearch` boolean state (초기값 false)
   - 토글 버튼
     - type="button"
     - onClick={() => setShowSearch(prev => !prev)}
     - 텍스트:
       - showSearch true → "검색 닫기"
       - showSearch false → "🔍 검색으로 추가"
     - className: "mt-2 text-xs text-gray-500 underline"
   - `showSearch`가 true일 때만 ContactSearchInput 표시
3. `handleSelectParticipant` 마지막에 `setShowSearch(false)` 추가

제약:
- attendees input 위치/구조는 유지
- handleSelectParticipant 기존 로직은 그대로 두고 마지막에 한 줄만 추가
- ContactSearchInput import 유지

────────────────────────────────────

파일 2: app/meeting-requests/[id]/page.tsx

변경 사항:
1. `showParticipantSearch` boolean state 추가 (초기값 false)
2. 편집 모드 참석자 섹션의 기존 ContactSearchInput 블록을 아래 구조로 교체:
   - 토글 버튼
     - type="button"
     - onClick={() => setShowParticipantSearch(prev => !prev)}
     - className: "mt-2 text-xs text-gray-500 underline"
     - 텍스트:
       - true → "검색 닫기"
       - false → "🔍 검색으로 추가"
   - `showParticipantSearch`가 true일 때만 ContactSearchInput 표시
3. `handleSelectParticipant` 마지막에 `setShowParticipantSearch(false)` 추가

제약:
- textarea 위치/구조는 유지
- handleSelectParticipant 기존 로직은 그대로 두고 마지막에 한 줄만 추가
- ContactSearchInput import 유지
- build 통과 필수

────────────────────────

## Codex 수정
- `app/new-request/page.tsx`
  - `showSearch` state 추가
  - `attendees` input 아래에 토글 버튼 추가
  - `showSearch`가 `true`일 때만 `ContactSearchInput` 렌더링
  - `handleSelectParticipant` 마지막에 `setShowSearch(false)` 추가

- `app/meeting-requests/[id]/page.tsx`
  - `showParticipantSearch` state 추가
  - 편집 모드 참석자 섹션의 검색 UI를 토글 버튼 + 조건부 `ContactSearchInput` 구조로 교체
  - `handleSelectParticipant` 마지막에 `setShowParticipantSearch(false)` 추가

- 제약 준수
  - `attendees` input / textarea 위치와 구조 유지
  - 기존 선택 로직은 유지하고 마지막에 닫기 한 줄만 추가
  - `ContactSearchInput` import 유지

- 검증
  - `npx eslint app/new-request/page.tsx 'app/meeting-requests/[id]/page.tsx'` 통과
  - `npm run build` 통과

────────────────────────

## Claude 검수
- `new-request/page.tsx`
  - attendees input이 메인 입력으로 가장 먼저 보이고
  - 검색 UI는 기본 접힘 상태의 토글 버튼 뒤에 위치하여
  - 콤마 입력 기반 메인 UX가 더 명확해짐

- `app/meeting-requests/[id]/page.tsx`
  - textarea가 명확히 메인 입력으로 유지되고
  - 검색 UI는 토글을 통해 필요할 때만 열리는 보조 흐름으로 조정됨

- 검색을 보조 흐름으로 내린 방향은 적절함
  - 기본 상태에서 검색 UI 숨김
  - 토글 버튼은 `type="button"`으로 form submit 방지
  - 선택 후 자동 접힘 동작 정상
  - 토글 텍스트 상태별 전환 정상

- 기존 동작 유지 확인
  - `onBlur` auto-resolve (new-request) 유지
  - `handleSelectParticipant` 기존 로직 유지
  - `participants_text` 저장 흐름 유지
  - `ContactSearchInput` import 유지

- 참고 사항
  - `[id]/page.tsx`는 접힌 상태에서도 회색 박스가 보이고
  - `new-request`는 버튼만 노출되어 시각적 일관성은 완전하지 않음
  - 기능 동작에는 영향 없으며 done 처리에는 문제 없음

- 결론:
  - 콤마 입력을 메인으로, 검색을 보조로 내리는 UX 방향이 구현되었고
  - 기존 로직을 깨뜨리지 않으면서 의도한 방향으로 정리되었음

────────────────────────

## 완료
- 종료 유형: fixed
- 요약: 참석자 입력 UX를 콤마 기반 메인 흐름 중심으로 재정렬하고 검색 UI를 기본 접힘의 보조 기능으로 축소하여 실제 사용 방식에 맞게 정리함
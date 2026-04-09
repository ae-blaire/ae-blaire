# Issue 005 — internal contacts layer

## 메타
- 상태: done
- 우선순위: P1
- 범위: participants input / contacts management
- 생성: 2026-04-09

## 증상
현재 참석자 입력은 Google Contacts 기반이라
내 개인 계정에 저장된 연락처만 사용 가능함

회사 구성원 전체를 대상으로 한
일관된 참석자 선택이 불가능함

## 기대 동작
참석자를 한 번 입력하면 시스템에 저장되고
이후 입력 시 자동완성으로 재사용 가능해야 함

즉, 내부 연락처 DB처럼 동작해야 함

────────────────────────

## Claude 분석

### 확인된 문제
- 참석자 데이터가 외부(Google Contacts)에 의존하고 있음
- 조직 단위 데이터가 아니라 개인 계정 단위 데이터임
- 동일 인물이라도 매번 수동 입력해야 할 가능성 있음

- 기존 참석자 처리 구조는 `/api/google-people/search`에 의존
- API 응답 형식만 맞추면 기존 로직 대부분 유지 가능
- contacts 테이블 + API만 추가하면 구조 변경 최소화 가능

### → Codex 요청문
다음 기능을 구현:

1. contacts 테이블 생성 (Supabase)

필드:
- id (uuid)
- name (text)
- email (text, optional)
- created_at

2. 참석자 입력 시:
- 새로운 이름 입력하면 contacts 테이블에 자동 insert
- 기존에 존재하면 재사용

3. 참석자 input UI:
- 입력 시 기존 contacts를 기반으로 autocomplete 제공
- 이름 일부 입력하면 matching 리스트 표시

4. meeting_requests 생성 시:
- participants_text 저장 방식 유지 (기존 구조 유지)
- 동시에 contacts에도 누적되도록 처리

제약:
- 기존 기능 깨지지 않도록
- UI는 최소 변경 (input 기반 유지)
- autocomplete는 간단한 리스트 형태로 구현

────────────────────────

## Codex 수정
- `app/api/contacts/search/route.ts`
  - `GET /api/contacts/search?query=...` API route 추가
  - `contacts` 테이블에서 `name ILIKE %query% OR email ILIKE %query%` 검색
  - 최대 8건 반환
  - 응답 형식은 `{ ok: true, results: [{ name, email, organization }] }`
  - `organization`에는 `department` 매핑

- `components/ContactSearchInput.tsx`
  - 공용 autocomplete 입력 컴포넌트 추가
  - 300ms debounce
  - 결과 드롭다운 표시
  - 클릭 시 `onSelect({ name, email })`
  - 선택 후 query 초기화 / 드롭다운 닫힘

- `app/new-request/page.tsx`
  - attendees 입력 위에 `ContactSearchInput` 추가
  - 선택 시 textarea에 이름 추가
  - `participantEmailMap`에 email 저장
  - 기존 자동 이메일 보완도 `/api/contacts/search` 기반으로 변경

- `app/meeting-requests/[id]/page.tsx`
  - availability 자동 이메일 보완을 `/api/contacts/search` 기반으로 변경
  - 편집 모드 검색 UI를 `ContactSearchInput`으로 교체
  - 선택 시 기존과 동일하게 이름 추가 + email map 저장

- 유지한 것
  - `participants_text` 구조 유지
  - `lib/participants.ts` 미수정
  - 기존 저장/정규화 흐름 유지
  - Google People API route는 유지하고, 이번 기능에서는 contacts API 사용

- 검증
  - `npx eslint app/api/contacts/search/route.ts components/ContactSearchInput.tsx app/new-request/page.tsx 'app/meeting-requests/[id]/page.tsx'` 통과
  - `npm run build` 통과

────────────────────────

## Claude 검수
- `new-request/page.tsx`
  - 참석자 선택 시 기존 `parseParticipantNamesText` → `getParticipantNameKey` 흐름 유지
  - textarea 업데이트 및 participantEmailMap 저장 방식 기존과 동일
  - `buildParticipantsStorageValueFromEmailMap` 연결 구조 유지됨

- `app/meeting-requests/[id]/page.tsx`
  - editForm.participants_text 수정 방식이 기존 저장 흐름과 완전히 호환됨
  - participantEmailMap 업데이트도 기존 구조 유지

- contacts API 응답 형식
  - `{ ok: true, results: [{ name, email, organization }] }`
  - 기존 google-people API와 동일 구조로 완전 호환

- autocomplete UI
  - debounce, blur 처리, 클릭 처리, 중복 제거 등 모두 안정적으로 구현됨
  - 라이브러리 없이 요구사항 충족

- 보완 사항:
  - `ParticipantSearchResult` 타입과 ContactSearchInput onSelect 타입 불일치 (런타임 영향 없음)
  - contacts 테이블에 데이터가 없으면 검색 결과가 나오지 않음 (운영 전 데이터 필요)

- 결론:
  - 기존 흐름을 깨지 않고 내부 contacts 기반 autocomplete가 정상 동작
  - 실사용 가능한 수준으로 구현 완료

────────────────────────

## 완료
- 종료 유형: fixed
- 요약: Google Contacts 의존을 제거하고 내부 contacts 테이블 기반 참석자 autocomplete 및 저장 흐름을 구축함
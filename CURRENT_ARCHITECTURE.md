# CURRENT_ARCHITECTURE.md

## 현재 기술 스택
- Next.js
- Supabase
- TypeScript
- Tailwind CSS

---

## 현재 제품 구조 요약

### 1. 요청 관리
- 미팅 요청 생성
- 요청 목록 조회
- 요청 상세 조회
- 상태 변경

### 2. 슬롯 관리
- 슬롯 후보 추가
- 슬롯 삭제
- 슬롯 1개 확정
- 확정 슬롯 기준 상태 연동

### 3. 체크리스트 관리
- confirmed 시 체크리스트 자동 생성
- 체크 항목 토글
- 텍스트 필드 저장
- 완료율 계산
- 체크리스트 기반 상태 자동 전이

### 4. 위험 감지
- 위험 요청 KPI
- 위험 요청 라벨
- 상세/리스트 경고 표시

### 5. 추천 시스템
- 슬롯 후보 점수 계산
- 추천 이유 계산
- 추천 뱃지 표시
- 점수 기반 슬롯 정렬

### 6. 캘린더 준비
- 캘린더 미리보기
- Google Calendar 열기
- API route 테스트 버튼
- invite_sent 자동 반영 흐름 일부 존재

---

## 주요 파일 역할

### 핵심 로직
- `lib/risk.ts`
  - 위험 판단 로직
  - checklist 개수 계산
- `lib/uiRules.ts`
  - confirmed 가능 여부
  - done 가능 여부
  - 상세 경고 문구
  - confirmAction
- `lib/recommend.ts`
  - 슬롯 점수 계산
  - 추천 badge/reason 생성
  - 슬롯 정렬

### 주요 화면
- `app/meeting-requests/page.tsx`
  - 요청 리스트
  - 상태 버튼
  - risk badge
  - warning 표시
- `app/meeting-requests/[id]/page.tsx`
  - 요청 상세
  - 슬롯/체크리스트/캘린더 미리보기
  - 상태 변경
  - 위험 경고
- `components/slot-candidates-section.tsx`
  - 슬롯 CRUD
  - 슬롯 추천 UI
  - 슬롯 선택 후 상태 연계

### 공용 UI
- `components/RiskBadge.tsx`
  - 위험 유형 뱃지 표시

---

## 현재 상태 머신

received
→ reviewing
→ slot_checking
→ confirmed
→ preparing
→ done

보류 상태:
- rejected

---

## 현재 데이터 흐름

### 요청 생성
meeting_requests 저장

### 슬롯 확정
meeting_slot_candidates 중 is_selected = true 1개

### 체크리스트
execution_checklists 생성 및 갱신

### 위험 판단
request + slot + checklist를 조합해 risk.ts에서 계산

### 추천 판단
request + slots를 조합해 recommend.ts에서 계산

---

## 현재 알려진 강점
1. 제품 법칙이 비교적 명확함
2. 상태 흐름이 구조화됨
3. 위험 감지가 이미 존재함
4. 추천 UI가 시작됨
5. 캘린더 연동 전 단계까지 도달함

---

## 현재 남은 큰 작업
1. 추천 로직 고도화
2. Google Calendar read 연동
3. Google Calendar event 생성 정교화
4. 공통 에러 처리 개선
5. 테스트/검증 보강
6. Claude Code / Codex 투입 구조 확립
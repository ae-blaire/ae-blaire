# PROJECT_RULES.md

## 프로젝트 한 줄 정의
Next.js + Supabase 기반 미팅 운영 시스템.
단순 CRUD가 아니라 요청 관리, 상태 흐름, 슬롯 확정, 실행 준비, 위험 감지까지 포함하는 운영 시스템이다.

---

## 제품 핵심 목적
이 시스템은 미팅 요청을 등록하는 도구가 아니라,
운영자가 실수 없이 일정과 준비를 관리하도록 돕는 운영 보드이자 판단 시스템이다.

---

## 절대 깨지면 안 되는 제품 법칙

### 상태 흐름
received → reviewing → slot_checking → confirmed → preparing → done

### 필수 규칙
1. slot 없으면 confirmed 불가
2. slot은 1개만 선택 가능
3. checklist 6/6 아니면 done 불가
4. confirmed 이후 준비가 일부라도 시작되면 preparing 가능
5. checklist 6/6이면 done 가능
6. selected slot은 최종 확정 시간으로 간주
7. 운영 로직은 UI보다 우선한다

---

## 위험 요청 정의
다음은 위험 요청으로 간주한다.

1. 긴급 + 슬롯 없음
2. confirmed / preparing 상태인데 checklist 6/6 미완료
3. 오늘 일정인데 checklist 6/6 미완료

---

## 개발 원칙

### 1. DB 우선
프론트 추측 금지.
항상 DB 컬럼명, 타입, 상태값을 먼저 확인하고 맞춘다.

### 2. 운영 규칙 우선
UI 편의보다 제품 법칙을 먼저 지킨다.

### 3. 상태 자동 전이 주의
상태 자동 전이는 체크리스트, 슬롯 선택 등 명확한 이벤트가 있을 때만 일어나야 한다.

### 4. 단일 책임
- `risk.ts`: 위험 판단
- `uiRules.ts`: UI 제어 규칙
- `recommend.ts`: 슬롯 추천 점수/이유 계산

### 5. 배포 전 필수 체크
- RLS 반드시 잠그기
- service role key 프론트 금지
- 데이터 무결성 검증
- 에러 처리 정리
- 상태 전이 검증

---

## 금지 사항
1. slot 없이 confirmed 허용 금지
2. checklist 미완료 done 허용 금지
3. DB 컬럼명 임의 추정 금지
4. service role 프론트 노출 금지
5. 상태 전이 규칙을 UI에서만 막고 서버/데이터 레벨 검증 누락 금지

---

## 현재 자동화 방향
현재 목표는 완전 자동 확정이 아니라:
1. 실수 방지
2. 위험 감지
3. 추천 제공
4. 이후 에이전트 연결

즉, “자동 판단 보조 시스템”을 먼저 완성한다.

## 레거시 fallback 원칙

1. 도메인 라이브러리(`lib/risk.ts`, `lib/recommend.ts`)는 판단에 필요한 핵심 레거시 입력에 대해서만 1단계 fallback을 허용한다.
   - 예:
     - `risk.ts`: `urgency_level -> urgency`
     - `recommend.ts`: `importance_level -> importance`, 필요 시 `urgency_level -> urgency`

2. 화면(`page.tsx`, 컴포넌트)은 fetch 직후 표준 컬럼 계약으로 정규화된 뷰 모델을 만든다.
   - 예:
     - `importance_level`
     - `urgency_level`
     - `planning_notes`
     - `background_notes`

3. 입력/저장 화면은 항상 표준 컬럼을 우선 기록한다.
   - 표준:
     - `importance_level`
     - `urgency_level`
     - `planning_notes`
     - `background_notes`
   - 레거시 컬럼 동시 저장은 이행 기간에만 허용한다.

4. 화면 표시용 의미 분리는 화면 정규화 계층에서 책임진다.
   - 운영 메모: `planning_notes -> memo -> notes`
   - 배경 메모: `background_notes` 단독

5. 레거시 fallback 규칙은 중앙 문서 기준으로만 사용하고, 파일마다 임의 fallback을 추가하지 않는다.
   - 중요도: `importance_level -> importance`
   - 긴급도: `urgency_level -> urgency`
   - 운영 메모: `planning_notes -> memo -> notes`
   - 배경 메모: `background_notes`

6. fallback은 이행용이다.
   - 백필 이후 제거 시점을 반드시 가진다.
   - 레거시 컬럼은 장기 유지 대상이 아니다.
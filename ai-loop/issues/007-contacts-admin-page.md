# Issue 007 — contacts admin page

## 메타
- 상태: open
- 우선순위: P1
- 범위: contacts management UI
- 생성: 2026-04-09

## 증상
현재 contacts 데이터는 Supabase SQL Editor를 통해서만 추가/삭제 가능함

개발자가 아닌 경우 contacts 관리가 불가능하고,
운영 중 연락처 추가/수정이 번거로움

## 기대 동작
웹 UI에서 contacts 데이터를 추가/삭제할 수 있어야 함

즉, 간단한 관리자 페이지에서:
- contacts 목록 조회
- 신규 추가
- 삭제
가 가능해야 함

────────────────────────

## Claude 분석

### 확인된 문제
- contacts는 시스템의 핵심 데이터가 되었지만 관리 UI가 없음
- 현재는 SQL 기반이라 운영자가 직접 다루기 어려움
- contacts 변경 빈도가 낮기 때문에 복잡한 기능은 불필요

### → Codex 요청문
다음 기능을 구현:

1. 신규 페이지 생성
   경로: `/contacts`

2. 기능
   - contacts 목록 조회 (이름순)
   - 입력 폼:
     - name (필수)
     - email (필수)
     - department (선택)
   - "추가" 버튼 → insert
   - 각 row에 "삭제" 버튼 → delete

3. 구현 방식
   - Supabase client 직접 사용 (API route 만들지 말 것)
   - insert: supabase.from("contacts").insert()
   - delete: supabase.from("contacts").delete().eq("id", id)

4. UI
   - 테이블 형태:
     이름 | 이메일 | 부서 | 삭제
   - 상단 또는 하단에 입력 폼
   - 최소 UI (디자인 신경 X)

5. 동작
   - 추가/삭제 후 목록 자동 refresh
   - 에러 시 간단 메시지 표시

6. Sidebar 수정
   - `/contacts` 링크 추가

제약:
- 인증 없이 동작 (현재 구조 유지)
- lib/supabase.ts 기존 client 사용
- 다른 기능 영향 주지 말 것
- build 통과 필수

────────────────────────

## Codex 수정

────────────────────────

## Claude 검수

────────────────────────

## 완료
- 종료 유형:
- 요약:
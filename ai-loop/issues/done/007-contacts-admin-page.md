# Issue 007 — contacts admin page

## 메타
- 상태: done
- 우선순위: P1
- 범위: contacts management UI
- 생성: 2026-04-09

## 증상
현재 contacts 데이터는 Supabase SQL Editor를 통해서만 추가/삭제 가능함

개발자가 아닌 경우 contacts 관리가 불가능하고,
운영 중 연락처 추가/수정이 번거로움

## 기대 동작
웹 UI에서 contacts 데이터를 추가/삭제할 수 있어야 함

즉, 관리자 페이지에서:
- contacts 목록 조회
- 신규 추가
- 삭제
가 가능해야 함

────────────────────────

## Claude 분석
- contacts는 autocomplete의 핵심 데이터로 사용됨
- 현재 SQL 기반 관리 방식은 운영자가 사용하기 어려움
- contacts 변경 빈도가 낮아 복잡한 기능 없이 최소 UI로 충분함

### → Codex 요청문
신규 기능: contacts 관리 페이지

1. 신규 페이지 생성 (`/contacts`)
2. contacts 목록 조회 (이름순)
3. 입력 폼:
   - name (필수)
   - email (필수)
   - department (선택)
4. "추가" 버튼 → insert
5. 각 row에 "삭제" 버튼 → delete
6. 추가/삭제 후 목록 자동 refresh
7. Sidebar에 `/contacts` 링크 추가

제약:
- API route 만들지 말 것
- 기존 supabase client 사용
- 최소 UI
- build 통과 필수

────────────────────────

## Codex 수정
- `app/contacts/page.tsx`
  - contacts 전체 조회 기능 추가 (이름순 정렬)
  - 입력 폼 구현:
    - name, email, department
  - "추가" 버튼으로 insert 처리
  - 각 row에 삭제 버튼 → delete().eq("id", id)
  - 추가/삭제 후 fetchContacts()로 목록 자동 refresh
  - 테이블 UI 구성:
    이름 | 이메일 | 부서 | 삭제

- `components/Sidebar.tsx`
  - `/contacts` 페이지로 이동하는 링크 추가

- 검증
  - `npx eslint app/contacts/page.tsx components/Sidebar.tsx` 통과
  - `npm run build` 통과
  - 배포 후 `/contacts` 페이지 정상 접근 확인

────────────────────────

## Claude 검수
- contacts 목록 조회 / 추가 / 삭제 기능 정상 동작 확인
- Supabase client 직접 사용 구조 문제 없음
- 기존 autocomplete 및 participants 흐름에 영향 없음
- 최소 UI 요구사항 충족
- Sidebar 링크를 통해 접근 가능

- 결론:
  - contacts 관리 기능이 UI로 확장되어
  - SQL 없이 운영 가능한 상태로 전환됨

────────────────────────

## 완료
- 종료 유형: fixed
- 요약: contacts 데이터를 웹 UI에서 직접 추가/삭제할 수 있는 관리자 페이지를 구현하여 운영 편의성을 개선함
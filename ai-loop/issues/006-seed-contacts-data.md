# Issue 006 — seed contacts data

## 메타
- 상태: open
- 우선순위: P1
- 범위: contacts table / contacts input flow
- 생성: 2026-04-09

## 증상
contacts 테이블 기반 autocomplete 구조는 만들어졌지만,
테이블에 데이터가 없으면 검색 결과가 항상 비어 있음

## 기대 동작
최소한의 방식으로 contacts 데이터를 넣을 수 있어야 하며,
입력된 데이터가 autocomplete에서 바로 검색 가능해야 함

────────────────────────

## Claude 분석
- contacts autocomplete 구조는 이미 구현되어 있음
- 현재 문제는 기능 부족이 아니라 contacts 테이블이 비어 있을 가능성이 높다는 점
- 지금 단계에서는 별도 UI 없이 Supabase SQL Editor로 직접 insert 하는 방식이 가장 적절함
- contacts 수가 아직 많지 않아 CSV 업로드는 과하고, admin UI도 나중에 만들어도 됨

### → Codex 요청문
이번 이슈는 Codex 작업 없이 운영 데이터 시딩으로 해결한다.

Supabase SQL Editor에서 아래 형식으로 contacts 데이터를 직접 insert:

INSERT INTO contacts (name, email, department) VALUES
  ('김블레어', 'blaire@company.com', '전략팀'),
  ('이민준', 'minjun@company.com', '개발팀'),
  ('박서연', 'seoyeon@company.com', '운영팀');

확인용:
SELECT * FROM contacts ORDER BY name;
────────────────────────

## Codex 수정
- 해당 없음
- 이번 이슈는 코드 변경 없이 Supabase SQL Editor에서 contacts 초기 데이터를 직접 insert하여 해결

- 실행 SQL
  - `INSERT INTO contacts (name, email, department) VALUES ...`
  - `SELECT * FROM contacts ORDER BY name;`

- 결과
  - contacts 테이블에 초기 데이터 입력 완료
  - autocomplete 테스트 가능 상태 확보

────────────────────────

## Claude 검수
- 현재 단계에서는 SQL 직접 insert가 가장 가볍고 적절한 방식
- 코드 변경 없이 autocomplete 검증이 가능함
- admin UI 또는 CSV 업로드는 필요 시 별도 이슈로 분리하는 것이 적절함

────────────────────────

## 완료
- 종료 유형:
- 요약:
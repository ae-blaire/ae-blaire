# Issue 008 — contact search enter submits form

## 메타
- 상태: done
- 우선순위: P1
- 범위: ContactSearchInput / new request form
- 생성: 2026-04-09

## 증상
New Request 화면의 참석자 검색 필드에서 Enter를 누르면
검색 선택이 아니라 폼 전체가 바로 submit되어 요청이 저장됨

## 기대 동작
참석자 검색 필드에서 Enter를 누를 때는
폼 submit이 아니라 검색 입력/선택 동작이 우선되어야 함

즉,
- 드롭다운이 열려 있으면 검색 결과 선택 또는 무시
- 최소한 폼 전체 submit은 막혀야 함

────────────────────────

## Claude 분석

### 확인된 문제
- 참석자 검색 input이 form 내부에 있어 Enter key가 상위 form submit으로 전파되는 것으로 보임
- ContactSearchInput 컴포넌트에서 Enter key 기본 동작을 막아야 할 가능성이 높음
- 버튼 type은 처리되어 있어도 input Enter submit은 별도로 막아야 함

### → Codex 요청문
문제:
New Request 화면의 참석자 검색 필드에서 Enter를 누르면
contacts 검색이 아니라 폼 전체가 submit됨

수정 사항:
1. `components/ContactSearchInput.tsx`에서 Enter key 입력 시
   상위 form submit이 발생하지 않도록 처리할 것
2. 검색 input에서 `onKeyDown` 또는 유사 방식으로
   `Enter` 입력 시 `preventDefault()` 적용
3. 드롭다운이 열려 있을 때의 동작이 있으면 기존 검색 UX를 해치지 않도록 유지
4. 신규 등록 페이지뿐 아니라 상세 편집 페이지에서도 동일 컴포넌트를 쓰므로
   양쪽에서 동일하게 안전하게 동작해야 함

제약:
- 기존 autocomplete 동작 유지
- 버튼 클릭 선택 방식 유지
- 다른 폼 동작 건드리지 말 것
- build 통과 필수

────────────────────────

## Codex 수정
- `components/ContactSearchInput.tsx`
  - 검색 input에 `onKeyDown` 추가
  - `Enter` 입력 시 `e.preventDefault()` 적용
  - 상위 form submit이 Enter로 트리거되지 않도록 수정
  - 드롭다운 검색/선택 UX와 버튼 클릭 방식은 그대로 유지

- 검증
  - `npx eslint components/ContactSearchInput.tsx` 통과
  - `npm run build` 통과

────────────────────────

## Claude 검수

────────────────────────

## 완료
- 종료 유형: fixed
- 요약: ContactSearchInput에서 Enter 입력 시 form submit이 발생하지 않도록 수정하여 신규 요청 및 상세 편집 화면의 오작동을 해결함
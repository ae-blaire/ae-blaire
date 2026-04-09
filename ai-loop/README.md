# AI Loop System (Team Blaire)

## 역할
- 기획: ChatGPT (블레어)
- 개발: Codex
- 검수/디버깅: Claude

---

## 작업 흐름

```
open → debugging → fixing → reviewing → done
```

| 단계 | 담당 | 이슈 파일 변경 |
|------|------|---------------|
| 1. 이슈 생성 | 블레어 | issues/NNN-title.md 생성, 상태: open |
| 2. Claude 분석 | Claude | "Claude 분석" 섹션 작성, 상태: debugging |
| 3. Codex 수정 | Codex | "Codex 수정" 섹션 작성, 상태: fixing |
| 4. Claude 검수 | Claude | "Claude 검수" 섹션 작성, 상태: reviewing |
| 5. 완료 처리 | 블레어 | "완료" 섹션 작성, 상태: done, done/ 폴더로 이동 |

---

## 기본 원칙

1. 한 번에 하나의 이슈만 처리
2. Claude는 분석/검수만 — 코드 수정 금지
3. Codex는 구현만 — 분석 금지
4. 수정 후 반드시 Claude 검수
5. 검수 통과 전까지 완료 처리 금지

---

## 폴더 구조

```
ai-loop/
├── README.md          ← 이 파일
├── issues/
│   ├── TEMPLATE.md    ← 이슈 템플릿 (복사해서 사용)
│   ├── NNN-title.md   ← 진행 중인 이슈
│   └── done/          ← 완료된 이슈
├── prompts/
│   ├── claude-debug-template.md
│   ├── codex-fix-template.md
│   └── claude-review-template.md
└── reviews/           ← 대형 검수 결과 보관 (선택)
```

---

## 이슈 번호 규칙

- 3자리 숫자: `001`, `002`, `003` ...
- 파일명: `NNN-짧은-설명.md`
- 우선순위: P0 (즉시) / P1 (이번 사이클) / P2 (여유 있을 때)

---

## 완료 기준

- 실제 기능이 정상 동작
- build 통과
- 사이드 이펙트 없음 (Claude 검수 확인)
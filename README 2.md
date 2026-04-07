# 슬롯 자동추천 적용 가이드

## 새로 넣을 파일
- `lib/recommend.ts`

## 원본 파일이 있어야 통파일로 정확히 바꿀 수 있는 파일
- `components/slot-candidates-section.tsx`

지금 패키지에는 안전하게 바로 넣을 수 있는 추천 엔진만 포함했어요.

## 1) import 추가
```tsx
import { rankSlots } from "@/lib/recommend";
```

## 2) 슬롯 데이터 준비 후 추천 결과 만들기
```tsx
const rankedSlots = rankSlots(request, slots);
```

- `request`: 현재 미팅 요청 객체
- `slots`: 슬롯 후보 배열

## 3) 렌더링은 rankedSlots 기준으로
```tsx
{rankedSlots.map(({ slot, score, badges, reasons }, index) => (
  <div key={slot.id}>
    {index === 0 && <span>⭐ 추천</span>}
    <div>점수: {score}</div>
    <div>{badges.join(" · ")}</div>
    <div>{reasons.join(" ")}</div>
  </div>
))}
```

## 4) 추천 UI 최소안
- 1등 슬롯에 `⭐ 추천`
- 점수 표시
- badge 1~3개 표시
- 이유 한 줄 표시

## 5) 추천 규칙
- urgency 50%
- importance 30%
- preferred date fit 20%

## 6) 진짜 통파일이 필요하면
`components/slot-candidates-section.tsx` 원본을 보내주면 바로 통째 교체용 파일로 맞춰줄 수 있어요.

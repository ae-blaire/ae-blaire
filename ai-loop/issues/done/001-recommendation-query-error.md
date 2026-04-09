# Issue 001

## 제목
추천용 요청 조회 시 importance_level 컬럼 에러 발생

## 증상
추천용 요청 조회 시 아래 오류 발생:

column meeting_requests.importance_level does not exist

## 범위
components/slot-candidates-section.tsx

## 기대 결과
추천 조회 시 DB 컬럼 오류 없이 정상 동작해야 함

## 비고
DB에는 importance, urgency 컬럼만 존재

## 상태
done

## 결과
현재 코드 기준으로 importance_level 컬럼을 직접 select하는 런타임 코드는 없음.
로컬 재현 시에도 에러 없음.
과거 번들/배포/캐시성 이슈로 판단하고 종료.
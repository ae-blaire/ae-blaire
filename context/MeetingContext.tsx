// context/MeetingContext.tsx
"use client";

import { createContext, useContext, useState, ReactNode } from "react";

// ✅ 미팅 데이터 타입 정의
export type Meeting = {
  id: number;
  title: string;
  purpose: string;
  requester: string;
  attendees: string;
  hasExternal: boolean;
  preferredDate: string;
  importance: string;
  urgency: string;
  memo: string;
  status: string; // "pending" | "approved" | "rejected"
};

// ✅ 초기 더미 데이터 (dummyData.ts 대신 여기서 관리)
const initialMeetings: Meeting[] = [
  {
    id: 1,
    title: "Q2 전략 방향 논의",
    purpose: "다음 분기 전략 방향 설정",
    requester: "홍길동",
    attendees: "김민준, 이서연",
    hasExternal: true,
    preferredDate: "2025-04-10",
    importance: "high",
    urgency: "urgent",
    memo: "",
    status: "pending",
  },
  {
    id: 2,
    title: "신규 서비스 기획 리뷰",
    purpose: "신규 서비스 기획안 검토",
    requester: "김민준",
    attendees: "박지훈",
    hasExternal: false,
    preferredDate: "2025-04-12",
    importance: "medium",
    urgency: "normal",
    memo: "",
    status: "approved",
  },
  {
    id: 3,
    title: "월간 팀 성과 공유",
    purpose: "이번 달 팀 KPI 리뷰",
    requester: "이서연",
    attendees: "전팀원",
    hasExternal: false,
    preferredDate: "2025-04-15",
    importance: "low",
    urgency: "low",
    memo: "",
    status: "pending",
  },
  {
    id: 4,
    title: "외부 파트너사 협력 논의",
    purpose: "파트너십 조건 협의",
    requester: "박지훈",
    attendees: "최수아, 외부 2명",
    hasExternal: true,
    preferredDate: "2025-04-08",
    importance: "critical",
    urgency: "asap",
    memo: "계약 관련 내용 포함",
    status: "rejected",
  },
  {
    id: 5,
    title: "디자인 시스템 정비 회의",
    purpose: "컴포넌트 통일 작업 논의",
    requester: "최수아",
    attendees: "홍길동",
    hasExternal: false,
    preferredDate: "2025-04-18",
    importance: "medium",
    urgency: "normal",
    memo: "",
    status: "approved",
  },
];

// ✅ Context 타입 정의 (창고에서 꺼낼 수 있는 것들)
type MeetingContextType = {
  meetings: Meeting[];
  addMeeting: (meeting: Omit<Meeting, "id" | "status">) => void;
};

// ✅ Context 생성
const MeetingContext = createContext<MeetingContextType | null>(null);

// ✅ Provider — 앱 전체를 감싸는 "창고 설치" 컴포넌트
export function MeetingProvider({ children }: { children: ReactNode }) {
  const [meetings, setMeetings] = useState<Meeting[]>(initialMeetings);

  // 새 미팅 추가 함수
  const addMeeting = (newData: Omit<Meeting, "id" | "status">) => {
    const newMeeting: Meeting = {
      ...newData,
      id: Date.now(), // 고유 ID를 현재 시간으로 생성
      status: "pending", // 새 요청은 항상 "검토 중"
    };
    setMeetings((prev) => [newMeeting, ...prev]); // 맨 앞에 추가
  };

  return (
    <MeetingContext.Provider value={{ meetings, addMeeting }}>
      {children}
    </MeetingContext.Provider>
  );
}

// ✅ 커스텀 훅 — 다른 파일에서 창고에 접근할 때 사용
export function useMeetings() {
  const context = useContext(MeetingContext);
  if (!context) {
    throw new Error("useMeetings는 MeetingProvider 안에서만 사용할 수 있어요");
  }
  return context;
}
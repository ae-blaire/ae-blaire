import { NextRequest, NextResponse } from "next/server";

type GoogleCalendarCreateBody = {
  summary: string;
  description?: string;
  start: {
    dateTime: string;
    timeZone?: string;
  };
  end: {
    dateTime: string;
    timeZone?: string;
  };
  location?: string;
  attendees?: Array<{ email: string }>;
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as GoogleCalendarCreateBody;

    if (!body?.summary) {
      return NextResponse.json(
        { error: "summary is required" },
        { status: 400 }
      );
    }

    if (!body?.start?.dateTime || !body?.end?.dateTime) {
      return NextResponse.json(
        { error: "start.dateTime and end.dateTime are required" },
        { status: 400 }
      );
    }

    // TODO:
    // 1. 서버에서 Google OAuth access token 확보
    // 2. Google Calendar Events.insert 호출
    // 3. 성공 시 event id / htmlLink 반환

    return NextResponse.json({
      ok: true,
      message: "Google Calendar API route skeleton is ready.",
      received: body,
    });
  } catch (error) {
    console.error("google-calendar create route error:", error);

    return NextResponse.json(
      { error: "Failed to create calendar event" },
      { status: 500 }
    );
  }
}
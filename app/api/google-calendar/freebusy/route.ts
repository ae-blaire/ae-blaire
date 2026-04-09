import { NextRequest, NextResponse } from "next/server";
import { fetchGoogleCalendarTimedBusyEvents } from "@/lib/google-calendar";

type FreeBusyRequestBody = {
  timeMin?: string;
  timeMax?: string;
  timeZone?: string;
  attendeeEmails?: string[];
};

function isValidIsoDateTime(value: string | undefined) {
  if (!value) return false;
  return !Number.isNaN(new Date(value).getTime());
}

export async function POST(req: NextRequest) {
  try {
    console.info("[google-calendar-freebusy-route] request received");
    const body = (await req.json()) as FreeBusyRequestBody;

    const timeMin =
      typeof body.timeMin === "string" ? body.timeMin : "";
    const timeMax =
      typeof body.timeMax === "string" ? body.timeMax : "";
    const timeZone =
      typeof body.timeZone === "string" && body.timeZone
        ? body.timeZone
        : "Asia/Seoul";

    if (!isValidIsoDateTime(timeMin) || !isValidIsoDateTime(timeMax)) {
      return NextResponse.json(
        { error: "timeMin and timeMax must be valid ISO datetime strings" },
        { status: 400 }
      );
    }

    const attendeeEmails = (Array.isArray(body.attendeeEmails)
      ? body.attendeeEmails
      : []
    )
      .filter((email): email is string => typeof email === "string")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean);

    if (attendeeEmails.length === 0) {
      return NextResponse.json(
        { error: "attendeeEmails must contain at least one email" },
        { status: 400 }
      );
    }

    const { attendees, failures } = await fetchGoogleCalendarTimedBusyEvents({
      timeMin,
      timeMax,
      timeZone,
      calendarIds: attendeeEmails,
    });

    if (failures.length > 0) {
      console.error("[google-calendar-freebusy] partial attendee failures", failures);
    }

    const warning =
      failures.length > 0
        ? failures.length === attendeeEmails.length
          ? "참석자 캘린더를 조회하지 못했어요. 권한 또는 캘린더 ID를 확인해주세요."
          : "일부 참석자의 캘린더를 조회할 수 없었어요. 권한 또는 캘린더 ID를 확인해주세요."
        : null;

    return NextResponse.json({
      ok: true,
      timeMin,
      timeMax,
      timeZone,
      attendees,
      failures,
      warning,
      note: "All-day events and transparent events are excluded from recommendation busy calculations.",
    });
  } catch (error) {
    console.error("google-calendar freebusy route error:", error);

    const rawMessage =
      error instanceof Error
        ? error.message
        : "Failed to fetch Google Calendar availability";
    const userMessage = rawMessage.toLowerCase().includes("not found")
      ? "참석자 캘린더를 조회하지 못했어요. 권한 또는 캘린더 ID를 확인해주세요."
      : rawMessage;

    return NextResponse.json(
      {
        error: userMessage,
      },
      { status: 500 }
    );
  }
}

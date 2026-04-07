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
    const body = (await req.json()) as FreeBusyRequestBody;

    if (!isValidIsoDateTime(body.timeMin) || !isValidIsoDateTime(body.timeMax)) {
      return NextResponse.json(
        { error: "timeMin and timeMax must be valid ISO datetime strings" },
        { status: 400 }
      );
    }

    const attendeeEmails = (body.attendeeEmails || [])
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean);

    if (attendeeEmails.length === 0) {
      return NextResponse.json(
        { error: "attendeeEmails must contain at least one email" },
        { status: 400 }
      );
    }

    const attendees = await fetchGoogleCalendarTimedBusyEvents({
      timeMin: body.timeMin,
      timeMax: body.timeMax,
      timeZone: body.timeZone || "Asia/Seoul",
      calendarIds: attendeeEmails,
    });

    return NextResponse.json({
      ok: true,
      timeMin: body.timeMin,
      timeMax: body.timeMax,
      timeZone: body.timeZone || "Asia/Seoul",
      attendees,
      note: "All-day events and transparent events are excluded from recommendation busy calculations.",
    });
  } catch (error) {
    console.error("google-calendar freebusy route error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch Google Calendar availability",
      },
      { status: 500 }
    );
  }
}

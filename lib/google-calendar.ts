type GoogleOAuthTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
};

type GoogleFreeBusyRequest = {
  timeMin: string;
  timeMax: string;
  timeZone?: string;
  calendarIds: string[];
};

type GoogleCalendarEventDateTime = {
  date?: string;
  dateTime?: string;
  timeZone?: string;
};

type GoogleCalendarEvent = {
  id?: string;
  status?: string;
  transparency?: string;
  start?: GoogleCalendarEventDateTime;
  end?: GoogleCalendarEventDateTime;
};

type GoogleCalendarEventsResponse = {
  items?: GoogleCalendarEvent[];
};

function getGoogleCalendarEnv() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "Google Calendar read-only 환경변수가 부족합니다. GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN을 확인해주세요."
    );
  }

  return {
    clientId,
    clientSecret,
    refreshToken,
  };
}

async function getGoogleAccessToken() {
  const { clientId, clientSecret, refreshToken } = getGoogleCalendarEnv();

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });

  const result = (await response.json()) as GoogleOAuthTokenResponse;

  if (!response.ok || !result.access_token) {
    throw new Error(
      result.error_description ||
        result.error ||
        "Google access token을 가져오지 못했습니다."
    );
  }

  return result.access_token;
}

export async function fetchGoogleCalendarFreeBusy({
  timeMin,
  timeMax,
  timeZone = "Asia/Seoul",
  calendarIds,
}: GoogleFreeBusyRequest) {
  const accessToken = await getGoogleAccessToken();

  const response = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      timeMin,
      timeMax,
      timeZone,
      items: calendarIds.map((id) => ({ id })),
    }),
    cache: "no-store",
  });

const result = (await response.json()) as {
  error?: { message?: string };
  calendars?: Record<
    string,
    {
      busy?: Array<{
        start: string;
        end: string;
      }>;
    }
  >;
};

  if (!response.ok) {
    throw new Error(
      result.error?.message || "Google Calendar freebusy 조회에 실패했습니다."
    );
  }

  return result;
}

export async function fetchGoogleCalendarTimedBusyEvents({
  timeMin,
  timeMax,
  timeZone = "Asia/Seoul",
  calendarIds,
}: GoogleFreeBusyRequest) {
  const accessToken = await getGoogleAccessToken();

  const attendeeResults = await Promise.all(
    calendarIds.map(async (calendarId) => {
      const url = new URL(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
          calendarId
        )}/events`
      );
      url.searchParams.set("timeMin", timeMin);
      url.searchParams.set("timeMax", timeMax);
      url.searchParams.set("singleEvents", "true");
      url.searchParams.set("orderBy", "startTime");
      url.searchParams.set("maxResults", "2500");
      url.searchParams.set("timeZone", timeZone);

      const response = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: "no-store",
      });

      const result = (await response.json()) as GoogleCalendarEventsResponse & {
        error?: { message?: string };
      };

      if (!response.ok) {
        const message =
          result.error?.message || "Google Calendar events 조회에 실패했습니다.";
        console.error("[google-calendar-events] attendee fetch failed", {
          calendarId,
          status: response.status,
          message,
        });

        return {
          ok: false as const,
          calendarId,
          status: response.status,
          message,
        };
      }

      const busy = (result.items || [])
        .filter((event) => event.status !== "cancelled")
        .filter((event) => event.transparency !== "transparent")
        .filter((event) => event.start?.dateTime && event.end?.dateTime)
        .map((event) => ({
          start: event.start?.dateTime || "",
          end: event.end?.dateTime || "",
        }))
        .filter((busyItem) => busyItem.start && busyItem.end);

      return {
        ok: true as const,
        attendee: {
          email: calendarId,
          busy,
          isFree: busy.length === 0,
        },
      };
    })
  );

  const attendees = attendeeResults
    .filter((item): item is Extract<(typeof attendeeResults)[number], { ok: true }> => item.ok)
    .map((item) => item.attendee);

  const failures = attendeeResults
    .filter((item): item is Extract<(typeof attendeeResults)[number], { ok: false }> => !item.ok)
    .map((item) => ({
      calendarId: item.calendarId,
      status: item.status,
      message: item.message,
    }));

  return {
    attendees,
    failures,
  };
}

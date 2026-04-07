type GoogleOAuthTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
};

type GooglePeopleSearchResponse = {
  results?: Array<{
    person?: {
      names?: Array<{
        displayName?: string;
      }>;
      emailAddresses?: Array<{
        value?: string;
      }>;
      organizations?: Array<{
        name?: string;
        title?: string;
      }>;
    };
  }>;
};

export type GooglePeopleSearchResult = {
  name: string;
  email: string;
  organization: string | null;
};

function getGooglePeopleEnv() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "Google People 검색 환경변수가 부족합니다. GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN을 확인해주세요."
    );
  }

  return {
    clientId,
    clientSecret,
    refreshToken,
  };
}

async function getGoogleAccessToken() {
  const { clientId, clientSecret, refreshToken } = getGooglePeopleEnv();

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

async function warmupContactSearch(accessToken: string) {
  const params = new URLSearchParams({
    query: "",
    pageSize: "1",
    readMask: "names,emailAddresses",
  });

  await fetch(`https://people.googleapis.com/v1/people:searchContacts?${params}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });
}

export async function searchGooglePeopleContacts(query: string) {
  const trimmed = query.trim();

  if (!trimmed) {
    return [];
  }

  const accessToken = await getGoogleAccessToken();

  await warmupContactSearch(accessToken);

  const params = new URLSearchParams({
    query: trimmed,
    pageSize: "8",
    readMask: "names,emailAddresses,organizations",
  });

  const response = await fetch(
    `https://people.googleapis.com/v1/people:searchContacts?${params}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    }
  );

  const result = (await response.json()) as GooglePeopleSearchResponse & {
    error?: { message?: string };
  };

  if (!response.ok) {
    throw new Error(
      result.error?.message || "Google People 연락처 검색에 실패했습니다."
    );
  }

  const seen = new Set<string>();

  return (result.results || [])
    .map((item) => {
      const person = item.person;
      const email = person?.emailAddresses?.[0]?.value?.trim() || "";
      const name = person?.names?.[0]?.displayName?.trim() || email;
      const organization = person?.organizations?.[0]?.name?.trim() || null;

      return {
        name,
        email,
        organization,
      };
    })
    .filter((item) => {
      if (!item.email) return false;
      if (seen.has(item.email)) return false;
      seen.add(item.email);
      return true;
    });
}

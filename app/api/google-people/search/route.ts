import { NextRequest, NextResponse } from "next/server";
import { searchGooglePeopleContacts } from "@/lib/google-people";

export async function GET(req: NextRequest) {
  try {
    const query = req.nextUrl.searchParams.get("query")?.trim() || "";

    if (!query) {
      return NextResponse.json({ ok: true, results: [] });
    }

    const results = await searchGooglePeopleContacts(query);

    return NextResponse.json({
      ok: true,
      results,
    });
  } catch (error) {
    console.error("google-people search route error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Google People 검색에 실패했습니다.",
      },
      { status: 500 }
    );
  }
}

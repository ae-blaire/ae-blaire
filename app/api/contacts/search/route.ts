import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getServerSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "Supabase 환경변수가 없습니다. NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY를 확인해주세요."
    );
  }

  return createClient(supabaseUrl, supabaseKey);
}

export async function GET(req: NextRequest) {
  try {
    const query = req.nextUrl.searchParams.get("query")?.trim() || "";

    if (!query) {
      return NextResponse.json({ ok: true, results: [] });
    }

    const supabase = getServerSupabase();
    const likeQuery = `%${query}%`;

    const { data, error } = await supabase
      .from("contacts")
      .select("name, email, department")
      .or(`name.ilike.${likeQuery},email.ilike.${likeQuery}`)
      .order("name", { ascending: true })
      .limit(8);

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({
      ok: true,
      results: (data || []).map((item) => ({
        name: item.name,
        email: item.email,
        organization: item.department ?? null,
      })),
    });
  } catch (error) {
    console.error("contacts search route error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "내부 연락처 검색에 실패했습니다.",
      },
      { status: 500 }
    );
  }
}

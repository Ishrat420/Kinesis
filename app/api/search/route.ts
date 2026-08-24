import { NextRequest, NextResponse } from "next/server";
import { search } from "@/lib/search/engine";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q") ?? "";
  const results = await search(query);
  return NextResponse.json({ query: query.trim(), results }, { headers: { "Cache-Control": "private, no-store" } });
}

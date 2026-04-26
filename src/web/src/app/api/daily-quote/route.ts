import { NextResponse } from "next/server";

let cached: { date: string; q: string; a: string } | null = null;

export async function GET() {
  const today = new Date().toISOString().split("T")[0];

  if (cached && cached.date === today) {
    return NextResponse.json({ q: cached.q, a: cached.a });
  }

  try {
    const res = await fetch("https://zenquotes.io/api/today", {
      next: { revalidate: 3600 },
    });
    const data = await res.json() as { q: string; a: string }[];
    if (data?.[0]?.q) {
      cached = { date: today, q: data[0].q, a: data[0].a };
      return NextResponse.json({ q: cached.q, a: cached.a });
    }
  } catch {}

  return NextResponse.json({ q: "", a: "" });
}

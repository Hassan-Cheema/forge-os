import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("q");
  if (!query) {
    return NextResponse.json({ error: "Missing query parameter q" }, { status: 400 });
  }

  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&no_html=1&skip_disambig=1`;

  const res = await fetch(url, {
    headers: { "User-Agent": "forge-os/1.0" },
    next: { revalidate: 60 },
  });

  if (!res.ok) {
    return NextResponse.json({ error: "Search failed" }, { status: 502 });
  }

  const data = await res.json();

  const results = {
    query,
    abstract: data.Abstract || null,
    abstractSource: data.AbstractSource || null,
    abstractURL: data.AbstractURL || null,
    answer: data.Answer || null,
    answerType: data.AnswerType || null,
    definition: data.Definition || null,
    definitionSource: data.DefinitionSource || null,
    relatedTopics: (data.RelatedTopics || [])
      .filter((t: { Text?: string; FirstURL?: string }) => t.Text && t.FirstURL)
      .slice(0, 8)
      .map((t: { Text: string; FirstURL: string }) => ({
        text: t.Text,
        url: t.FirstURL,
      })),
  };

  return NextResponse.json(results);
}

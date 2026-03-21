import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

const TEXT_EXTENSIONS = ["txt", "md", "tex", "csv", "json", "xml", "html", "htm"];
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_CHARS = 60_000; // ~45K tokens — safe for any model context

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart form data." }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided." }, { status: 400 });

  if (file.size > MAX_SIZE)
    return NextResponse.json({ error: "File too large. Maximum size is 10 MB." }, { status: 400 });

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  let text = "";

  if (file.type === "application/pdf" || ext === "pdf") {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require("pdf-parse") as (buf: Buffer) => Promise<{ text: string }>;
      const buffer = Buffer.from(await file.arrayBuffer());
      const result = await pdfParse(buffer);
      text = result.text;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return NextResponse.json(
        { error: `PDF extraction failed: ${msg}. Try a text file (.txt, .md) instead.` },
        { status: 500 }
      );
    }
  } else if (file.type.startsWith("text/") || TEXT_EXTENSIONS.includes(ext)) {
    text = await file.text();
  } else {
    return NextResponse.json(
      {
        error: `Unsupported file type ".${ext}". Supported formats: PDF, TXT, MD, TEX, CSV, JSON.`,
      },
      { status: 400 }
    );
  }

  // Clean up whitespace from PDF extraction
  text = text.replace(/\r\n/g, "\n").replace(/\n{4,}/g, "\n\n").trim();

  const truncated = text.slice(0, MAX_CHARS);

  return NextResponse.json({
    text: truncated,
    filename: file.name,
    chars: truncated.length,
    wasTruncated: text.length > MAX_CHARS,
  });
}

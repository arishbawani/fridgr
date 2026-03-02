import Groq from "groq-sdk";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const DAILY_LIMIT = 10;

function getToday() {
  return new Date().toISOString().split("T")[0];
}

export async function POST(req: NextRequest) {
  // Validate access code
  const code = req.headers.get("x-access-code")?.trim();
  if (!code || code !== process.env.APP_SECRET?.trim()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await req.json();
  const { image } = body;
  if (!image) {
    return NextResponse.json({ error: "No image provided" }, { status: 400 });
  }

  // Rate limiting by IP
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const today = getToday();

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data: rateData } = await supabase
    .from("scan_rate_limits")
    .select("date, count")
    .eq("identifier", ip)
    .maybeSingle();

  if (rateData && rateData.date === today && rateData.count >= DAILY_LIMIT) {
    return NextResponse.json(
      { error: `Daily scan limit reached (${DAILY_LIMIT}/day). Try again tomorrow.` },
      { status: 429 }
    );
  }

  const newCount = !rateData || rateData.date !== today ? 1 : rateData.count + 1;
  await supabase.from("scan_rate_limits").upsert({
    identifier: ip,
    date: today,
    count: newCount,
    updated_at: new Date().toISOString(),
  });

  // Call Groq vision
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: "API key not configured" }, { status: 500 });
  }

  const client = new Groq({ apiKey });

  try {
    const completion = await client.chat.completions.create({
      model: "meta-llama/llama-4-scout-17b-16e-instruct",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: image },
            },
            {
              type: "text",
              text: 'Look at this fridge or pantry photo. List every food ingredient or item you can see. Return ONLY a JSON array of lowercase strings, one item per string. Example: ["chicken breast", "broccoli", "cheddar cheese", "eggs", "olive oil", "greek yogurt"]. Only include actual food items — skip containers, packaging labels you cannot read, and appliances. Be specific (e.g. "ground beef" not just "meat").',
            },
          ],
        },
      ],
      temperature: 0.1,
      max_tokens: 400,
    });

    const content = completion.choices[0]?.message?.content ?? "[]";
    const match = content.match(/\[[\s\S]*\]/);
    const ingredients: string[] = match ? JSON.parse(match[0]) : [];

    return NextResponse.json({
      ingredients,
      scansRemaining: DAILY_LIMIT - newCount,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

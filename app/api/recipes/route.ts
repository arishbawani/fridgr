import Groq from "groq-sdk";
import { NextRequest, NextResponse } from "next/server";

// Simple in-memory rate limiter: 10 requests per IP per hour
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const LIMIT = 10;
const WINDOW_MS = 60 * 60 * 1000; // 1 hour

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }

  if (entry.count >= LIMIT) return false;

  entry.count++;
  return true;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: "You've hit the limit of 10 requests per hour. Try again later." },
      { status: 429 }
    );
  }

  const { ingredients, maxCalories, minProtein, dietary } = await req.json();

  if (!ingredients || ingredients.length === 0) {
    return NextResponse.json({ error: "No ingredients provided" }, { status: 400 });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "API key not configured" }, { status: 500 });
  }

  const client = new Groq({ apiKey });

  const dietaryText = dietary && dietary.length > 0
    ? `Dietary restrictions: ${dietary.join(", ")}.`
    : "";

  const calorieText = maxCalories ? `Max calories per serving: ${maxCalories}.` : "";
  const proteinText = minProtein ? `Min protein per serving: ${minProtein}g.` : "";

  const prompt = `You are a recipe assistant. The user has these ingredients: ${ingredients.join(", ")}.
${calorieText} ${proteinText} ${dietaryText}

Suggest exactly 3 recipes they can make. Prioritize using the ingredients they already have.

Return ONLY a valid JSON array with this exact structure, no markdown, no extra text:
[
  {
    "name": "Recipe Name",
    "description": "One sentence description",
    "prepTime": "20 min",
    "servings": 2,
    "macros": {
      "calories": 450,
      "protein": 35,
      "carbs": 40,
      "fat": 12
    },
    "have": ["ingredient1", "ingredient2"],
    "need": ["ingredient3"],
    "steps": ["Step 1 description", "Step 2 description", "Step 3 description"]
  }
]`;

  const completion = await client.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.7,
  });

  const text = completion.choices[0]?.message?.content?.trim() ?? "";

  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    return NextResponse.json({ error: "Failed to parse AI response" }, { status: 500 });
  }

  const recipes = JSON.parse(jsonMatch[0]);
  return NextResponse.json({ recipes });
}

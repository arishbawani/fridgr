# fridgr

Turn what you have into what to eat.

You type in whatever's sitting in your fridge, set a calorie or protein target if you care about that, and it gives you 3 recipes you can actually make — along with what you're missing if anything.

Live at: **https://fridge-app-eosin.vercel.app** (access code required)

---

## What it does

- Add ingredients one at a time (chicken, rice, garlic, whatever)
- Optional: set a max calorie limit or minimum protein goal
- Optional: filter by dietary preference (vegetarian, vegan, gluten-free, etc.)
- Hit "Find Recipes" — get 3 real recipes with macros, steps, and a breakdown of what you already have vs. what you'd need to buy

## Stack

- Next.js (App Router) + TypeScript
- Tailwind CSS
- Groq API — llama-3.3-70b-versatile for recipe generation
- Deployed on Vercel

## Running locally

```bash
npm install
npm run dev
```

You'll need a `.env.local` file with:

```
GROQ_API_KEY=your_key_here
APP_SECRET=your_access_code_here
```

Get a free Groq API key at [console.groq.com](https://console.groq.com). No billing required.

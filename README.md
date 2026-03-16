# forge-os

AI agent infrastructure with real-time search, authentication, and payments — built on Next.js 16, Supabase, and Stripe.

---

## What's included

| Feature | Description |
|---|---|
| **DuckDuckGo search** | Live web search API agents can call. No API key required. |
| **Supabase auth** | Email/password login, signup with confirmation, protected routes. |
| **Stripe payments** | Subscription checkout + webhook handler. |
| **Landing page** | Hero, features, pricing tiers, and footer. |
| **Dashboard** | Protected page for signed-in users. |

---

## Project structure

```
app/
├── page.tsx                      # Landing page
├── dashboard/
│   └── page.tsx                  # Protected dashboard (requires auth)
├── auth/
│   ├── login/page.tsx            # Login form
│   ├── signup/page.tsx           # Signup form
│   └── callback/route.ts         # Supabase OAuth/email callback
└── api/
    ├── search/route.ts           # DuckDuckGo search endpoint
    └── stripe/
        ├── checkout/route.ts     # Create Stripe checkout session
        └── webhook/route.ts      # Handle Stripe webhook events

lib/
├── supabase/
│   ├── client.ts                 # Browser Supabase client
│   └── server.ts                 # Server Supabase client (SSR)
└── stripe.ts                     # Stripe SDK instance

middleware.ts                     # Route protection + session refresh
.env.local.example                # Required environment variables
```

---

## Getting started

### 1. Install dependencies

```bash
npm install
```

### 2. Set up environment variables

```bash
cp .env.local.example .env.local
```

Fill in the values (see [Environment variables](#environment-variables) below).

### 3. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Environment variables

| Variable | Where to find it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | [Supabase dashboard](https://supabase.com/dashboard) → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Same page, anon/public key |
| `STRIPE_SECRET_KEY` | [Stripe dashboard](https://dashboard.stripe.com/apikeys) → Secret key |
| `STRIPE_WEBHOOK_SECRET` | Stripe dashboard → Webhooks → your endpoint → Signing secret |
| `NEXT_PUBLIC_APP_URL` | Your deployment URL, e.g. `https://forge-os.vercel.app` |
| `NEXT_PUBLIC_STRIPE_PRO_PRICE_ID` | Stripe dashboard → Products → Pro plan → Price ID |

---

## API routes

### `GET /api/search`

Searches DuckDuckGo and returns structured results. Used by agents to get live web data.

**Query params**

| Param | Required | Description |
|---|---|---|
| `q` | yes | Search query |

**Example**

```bash
curl "http://localhost:3000/api/search?q=latest+AI+research"
```

**Response**

```json
{
  "query": "latest AI research",
  "abstract": "Artificial intelligence...",
  "abstractSource": "Wikipedia",
  "abstractURL": "https://en.wikipedia.org/...",
  "answer": null,
  "relatedTopics": [
    { "text": "Large language models", "url": "https://..." },
    { "text": "Reinforcement learning", "url": "https://..." }
  ]
}
```

---

### `POST /api/stripe/checkout`

Creates a Stripe checkout session for a subscription. Requires the user to be signed in.

**Request body**

```json
{ "priceId": "price_..." }
```

**Response**

```json
{ "url": "https://checkout.stripe.com/..." }
```

Redirect the user to the returned `url` to complete payment.

---

### `POST /api/stripe/webhook`

Stripe sends events here after payment activity. Register this URL in your [Stripe webhook settings](https://dashboard.stripe.com/webhooks).

**Handled events**

| Event | Action |
|---|---|
| `checkout.session.completed` | Payment succeeded — activate user subscription |
| `customer.subscription.deleted` | Subscription cancelled — revoke user access |

For local testing use the [Stripe CLI](https://stripe.com/docs/stripe-cli):

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

---

## Auth flow

1. User signs up at `/auth/signup` → Supabase sends a confirmation email
2. User clicks the link → hits `/auth/callback` → session created → redirected to `/dashboard`
3. User signs in at `/auth/login` → redirected to `/dashboard`
4. `middleware.ts` protects all `/dashboard/*` routes and redirects unauthenticated users to `/auth/login`

---

## Supabase setup

1. Create a project at [supabase.com](https://supabase.com)
2. Enable **Email** provider under Authentication → Providers
3. Set **Site URL** to your app URL under Authentication → URL Configuration
4. Add `http://localhost:3000/auth/callback` to **Redirect URLs**

---

## Stripe setup

1. Create a product and price in your [Stripe dashboard](https://dashboard.stripe.com/products)
2. Copy the **Price ID** (`price_...`) into `NEXT_PUBLIC_STRIPE_PRO_PRICE_ID`
3. Create a webhook endpoint pointing to `https://your-domain.com/api/stripe/webhook`
4. Subscribe to at minimum: `checkout.session.completed`, `customer.subscription.deleted`
5. Copy the **Signing secret** into `STRIPE_WEBHOOK_SECRET`

---

## Deploying to Vercel

```bash
vercel
```

Add all environment variables in the Vercel dashboard under Project → Settings → Environment Variables. Set `NEXT_PUBLIC_APP_URL` to your Vercel deployment URL.

---

## Tech stack

- [Next.js 16](https://nextjs.org) — App Router, Server Components, API Routes
- [Supabase](https://supabase.com) — Auth and database
- [Stripe](https://stripe.com) — Payments and subscriptions
- [Tailwind CSS 4](https://tailwindcss.com) — Styling
- [TypeScript](https://typescriptlang.org)

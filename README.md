# 🥭 Mango Product Feed

A Shopify embedded app that generates a shareable XML product feed URL from your Shopify store's product catalog — compatible with Google Shopping, Meta, TikTok, Pinterest, and more.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Shopify Remix (React Router) |
| Runtime | Node.js 18+ |
| UI | Shopify Polaris v12 |
| API | Shopify GraphQL Admin API 2024-10 |
| Database | Prisma + SQLite (swappable to Postgres) |
| Auth | Shopify App Bridge (OAuth) |

---

## Features

- ✅ Embedded Shopify App (App Bridge)
- ✅ Dashboard with store stats and recent products
- ✅ **Generate Product Feed** button — fetches all products via GraphQL pagination
- ✅ **Feed URL page** — view, copy, and open your unique feed URL
- ✅ Stores feed URL + token in SQLite database (per shop)
- ✅ Public feed endpoint serving Google Shopping-compatible XML
- ✅ Regenerate / Delete feed
- ✅ Webhooks: cleans up feed on APP_UNINSTALLED

---

## Project Structure

```
mango-product-feed/
├── app/
│   ├── routes/
│   │   ├── app.tsx              # Polaris AppProvider + NavMenu layout
│   │   ├── app._index.tsx       # 📊 Dashboard page
│   │   ├── app.feed.tsx         # 🔗 Feed management page
│   │   ├── feed.$token.tsx      # 📡 Public XML feed endpoint
│   │   ├── auth.$.tsx           # Shopify OAuth catch-all
│   │   ├── auth.login.tsx       # Login page
│   │   └── webhooks.tsx         # Webhook handler
│   ├── shopify.server.ts        # Shopify app configuration
│   ├── db.server.ts             # Prisma client singleton
│   ├── entry.client.tsx
│   ├── entry.server.tsx
│   └── root.tsx
├── prisma/
│   ├── schema.prisma            # Session + ProductFeed models
│   └── migrations/
├── shopify.app.toml             # Shopify CLI config
├── vite.config.ts
├── package.json
└── .env.example
```

---

## Getting Started

### Prerequisites

- Node.js 18.20.0+
- Shopify Partner account
- Shopify CLI (`npm install -g @shopify/cli`)

### 1. Clone & Install

```bash
git clone <your-repo>
cd mango-product-feed
npm install
```

### 2. Create a Shopify App

1. Go to [partners.shopify.com](https://partners.shopify.com)
2. Create a new app → **Public app**
3. Copy your **API key** and **API secret**

### 3. Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:
```env
SHOPIFY_API_KEY=your_api_key_here
SHOPIFY_API_SECRET=your_api_secret_here
DATABASE_URL="file:./dev.db"
SCOPES="read_products,read_product_listings"
```

### 4. Set Up Database

```bash
npx prisma migrate dev --name init
npx prisma generate
```

### 5. Link Shopify App Config

```bash
shopify app config link
```

### 6. Start Development

```bash
shopify app dev
```

This will:
- Start a Cloudflare tunnel
- Set `SHOPIFY_APP_URL` automatically
- Open the Shopify CLI dashboard

---

## Database Schema

### `Session` table
Managed by `@shopify/shopify-app-session-storage-prisma` — stores OAuth sessions per shop.

### `ProductFeed` table

| Column | Type | Description |
|---|---|---|
| `id` | String (UUID) | Primary key |
| `shop` | String (unique) | Myshopify domain |
| `feedUrl` | String | Full public feed URL |
| `feedToken` | String (unique) | UUID token in the URL |
| `productCount` | Int | Products at last generation |
| `lastGenerated` | DateTime | Last generation timestamp |
| `createdAt` | DateTime | Record creation time |
| `updatedAt` | DateTime | Auto-updated |

---

## Feed URL Format

```
https://<your-app-url>/feed/<uuid-token>
```

The feed serves **Google Shopping RSS XML** format:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>My Store - Product Feed</title>
    ...
    <item>
      <g:id>123456789</g:id>
      <title>Product Name</title>
      <g:price>29.99 USD</g:price>
      <g:availability>in stock</g:availability>
      ...
    </item>
  </channel>
</rss>
```

---

## Switching to PostgreSQL

1. Update `prisma/schema.prisma`:
   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```

2. Update `.env`:
   ```env
   DATABASE_URL="postgresql://user:password@localhost:5432/mango_feed"
   ```

3. Re-run migrations:
   ```bash
   npx prisma migrate deploy
   ```

---

## Deployment

### Railway / Render / Fly.io

1. Set all environment variables in your hosting dashboard
2. Set `DATABASE_URL` to your production database
3. Build command: `npm run build`
4. Start command: `npm run docker-start`

### Update `shopify.app.toml`

Replace placeholder URLs with your production URL:
```toml
application_url = "https://your-production-url.com"

[auth]
redirect_urls = [
  "https://your-production-url.com/auth/callback",
  ...
]
```

---

## Shopify App Scopes

This app requires:
- `read_products` — to fetch product catalog
- `read_product_listings` — for published product data

---

## License

MIT

# 🛡️ FraudShieldBD — Shopify App

বাংলাদেশের e-commerce স্টোরের জন্য COD ফ্রড চেকার। Shopify স্টোরে নতুন অর্ডার আসলে অটোমেটিক কাস্টমারের ফোন নম্বর চেক করে Success/Cancel রেশিও ও রিস্ক লেভেল দেখায়।

## ✨ ফিচারসমূহ

- **🔄 অটো চেক** — নতুন COD অর্ডারে অটোমেটিক ফোন চেক
- **🏷️ অটো ট্যাগ** — অর্ডারে `fsbd:safe`, `fsbd:medium`, `fsbd:high` ট্যাগ
- **📝 অর্ডার নোট** — বিস্তারিত চেক রিপোর্ট অর্ডার নোটে
- **📊 কুরিয়ার ব্রেকডাউন** — Steadfast, Pathao, RedX, eCourier, PaperFly সহ সব কুরিয়ারের ডাটা
- **🚨 ফ্রড রিপোর্ট** — কাস্টমারের বিরুদ্ধে থাকা রিপোর্ট দেখায়
- **🔍 ম্যানুয়াল চেক** — Admin UI থেকে যেকোনো ফোন নম্বর চেক
- **⚡ ক্যাশিং** — ৫ মিনিটের ক্যাশ (একই নম্বর বারবার চেক করলে লিমিট কাটে না)
- **⚙️ কনফিগারেবল** — রিস্ক থ্রেশহোল্ড, COD-only, অটো-চেক সব কাস্টমাইজ

## 📁 ফোল্ডার স্ট্রাকচার

```
fraudshieldbd/
├── server.js              # Express server entry point
├── config.js              # Environment configuration
├── package.json           # Dependencies
├── .env.example           # Environment variables template
├── lib/
│   ├── fraudshield-api.js # FraudShieldBD API client
│   ├── shopify-client.js  # Shopify Admin API helper
│   ├── order-checker.js   # Order processing logic
│   └── webhook-verify.js  # Webhook HMAC verification
├── routes/
│   ├── auth.js            # OAuth install/callback
│   ├── webhooks.js        # Webhook handlers
│   └── api.js             # Admin API endpoints
└── views/
    └── admin.html         # Admin dashboard UI
```

## 🚀 সেটআপ

### 1. Shopify Partners অ্যাকাউন্ট

1. [partners.shopify.com](https://partners.shopify.com) এ যান
2. নতুন App তৈরি করুন
3. App URL: `https://your-domain.com`
4. Redirect URL: `https://your-domain.com/auth/callback`
5. API Key ও Secret কপি করুন

### 2. ইনস্টল

```bash
cd fraudshieldbd
cp .env.example .env
# .env ফাইলে Shopify ও FraudShieldBD credentials দিন
npm install
npm start
```

### 3. .env কনফিগার

```env
SHOPIFY_API_KEY=your_shopify_api_key
SHOPIFY_API_SECRET=your_shopify_api_secret
FRAUDSHIELD_API_KEY=cf_your_key_here
HOST=https://your-domain.com
```

### 4. স্টোরে ইনস্টল

```
https://your-domain.com/auth?shop=YOUR-STORE.myshopify.com
```

## 🔗 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/auth` | Start OAuth install flow |
| GET | `/auth/callback` | OAuth callback |
| POST | `/webhooks/orders-create` | New order webhook |
| POST | `/webhooks/orders-updated` | Order updated webhook |
| POST | `/api/test-connection` | Test FraudShieldBD connection |
| POST | `/api/check-phone` | Manual phone check |
| POST | `/api/check-order` | Manual order check |
| GET | `/api/order-status/:id` | Get order check result |
| GET | `/admin` | Admin dashboard UI |

## 🏷️ Order Tags

প্লাগইন অটোমেটিক এই ট্যাগ যোগ করে:

| ট্যাগ | মানে |
|-------|------|
| `FraudShieldBD` | চেক হয়েছে |
| `fsbd:safe` | ✅ নিরাপদ (ratio ≥ 70%) |
| `fsbd:medium` | ⚠️ সতর্ক (ratio 50-70%) |
| `fsbd:high` | ⛔ বিপদজনক (ratio < 50%) |
| `fsbd:reported` | 🚨 ফ্রড রিপোর্ট আছে |

## 📋 Order Metafields

`fraudshieldbd` namespace-এ সেভ হয়:

- `checked` — yes / error
- `risk_level` — safe / medium / high / unknown
- `total_parcel`, `success_parcel`, `cancel_parcel`
- `success_ratio`
- `report_count`
- `couriers` — JSON কুরিয়ার ডাটা
- `checked_at` — চেক টাইমস্ট্যাম্প

## 📝 Requirements

- Node.js 18+
- FraudShieldBD সাবস্ক্রিপশন ([fraudshield.bd](https://fraudshield.bd))
- Shopify Partners অ্যাকাউন্ট
- HTTPS সার্ভার (webhook-এর জন্য)

## 📄 License

MIT © FraudShieldBD

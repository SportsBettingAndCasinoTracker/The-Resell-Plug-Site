# TheResellPlug - Production Checkout Stack

This project now includes:
- Server-side PayPal order creation + capture
- Webhook signature verification
- Email delivery for digital products
- SQLite order database
- Admin dashboard (`/admin.html`)
- Secure tokenized downloads (`/download/:token`)

## 1) Install

```bash
cd /Users/joshuascauzillo/Desktop/Website
npm install
```

## 2) Configure environment

```bash
cp .env.example .env
```

Set these in `.env`:
- `SITE_URL` (your public domain in production)
- `PAYPAL_ENV=live` (or `sandbox` for testing)
- `PAYPAL_CLIENT_ID`
- `PAYPAL_CLIENT_SECRET`
- `PAYPAL_WEBHOOK_ID`
- `ADMIN_DASH_TOKEN` (private token for dashboard API)
- SMTP values (`SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `FROM_EMAIL`) for email delivery

## 3) Run server

```bash
npm start
```

Open:
- Storefront: `http://localhost:3000`
- Dashboard: `http://localhost:3000/admin.html`

## 4) Configure PayPal webhook

In PayPal Developer Dashboard (Live app):
1. Add webhook URL: `https://YOUR_DOMAIN/api/paypal/webhook`
2. Subscribe to event: `PAYMENT.CAPTURE.COMPLETED`
3. Copy webhook ID into `.env` as `PAYPAL_WEBHOOK_ID`

## 5) Dashboard usage

1. Open `/admin.html`
2. Enter your `ADMIN_DASH_TOKEN`
3. Click `Load Orders`

The dashboard shows status, verification state, and email delivery state.

## Notes

- `ALLOW_TEST_CHARGE=true` enables URL test mode (`?testCharge=1`) to force 1.00 charge amount.
- Secret keys never belong in frontend files.
- This app requires running through Node/Express (not static-only hosting) for secure payment verification.
- Edit real post-purchase supplier links in `vendors.js` and `server.js` under each product's `deliveryLinks` array.

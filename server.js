const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const Database = require("better-sqlite3");
const nodemailer = require("nodemailer");
require("dotenv").config();

const app = express();
const rootDir = __dirname;
const dbPath = path.join(rootDir, "data", "orders.db");

fs.mkdirSync(path.join(rootDir, "data"), { recursive: true });

const db = new Database(dbPath);
db.exec(`
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    paypal_order_id TEXT UNIQUE,
    capture_id TEXT,
    vendor_id TEXT NOT NULL,
    vendor_name TEXT NOT NULL,
    vendor_category TEXT NOT NULL,
    buyer_email TEXT NOT NULL,
    amount TEXT NOT NULL,
    currency TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'CREATED',
    verified INTEGER NOT NULL DEFAULT 0,
    email_sent INTEGER NOT NULL DEFAULT 0,
    download_token TEXT,
    payer_name TEXT,
    payment_source TEXT,
    raw_capture_json TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_orders_capture_id ON orders(capture_id);
  CREATE INDEX IF NOT EXISTS idx_orders_download_token ON orders(download_token);
`);

const vendors = [
  {
    id: "starter-bundle",
    name: "Elite Supplier Bundle",
    category: "Bundle",
    price: 37.99,
    deliveryFile: "Bundle Email.png",
    whatYouGet: ["Clothing Vendor", "Cologne Vendor", "Electronic Vendor", "Receipt Vendor", "Watch Vendor"],
    deliveryLinks: [
      "https://replace-with-your-clothing-vendor-link.com",
      "https://replace-with-your-cologne-vendor-link.com",
      "https://replace-with-your-electronic-vendor-link.com",
      "https://replace-with-your-receipt-vendor-link.com",
      "https://replace-with-your-watch-vendor-link.com"
    ]
  },
  {
    id: "lux-clothing",
    name: "Clothing Vendor",
    category: "Clothing",
    price: 9.99,
    deliveryFile: "Clothing Email.png",
    whatYouGet: ["1,000+ Different types of clothing, Jackets, and Jewellery"],
    deliveryLinks: ["https://replace-with-your-clothing-vendor-link.com"]
  },
  {
    id: "sneaker-source",
    name: "Cologne Vendor",
    category: "Cologne",
    price: 9.99,
    deliveryFile: "Colonge Email.png",
    whatYouGet: ["Over 300+ Different Types of Cologne & Perfume"],
    deliveryLinks: ["https://replace-with-your-cologne-vendor-link.com"]
  },
  {
    id: "tech-electronics",
    name: "Electronic Vendor",
    category: "Electronics",
    price: 9.99,
    deliveryFile: "Electronic Email.png",
    whatYouGet: ["Airpod (2,3,4)", "Airpod Maxes", "JBL Speaker", "Dyson", "Beats"],
    deliveryLinks: ["https://replace-with-your-electronic-vendor-link.com"]
  },
  {
    id: "beauty-glow",
    name: "Receipt Vendor",
    category: "Reciepts",
    price: 9.99,
    deliveryFile: "Reciept Email.png",
    whatYouGet: ["100+ DIfferent Store Receipts"],
    deliveryLinks: ["https://replace-with-your-receipt-vendor-link.com"]
  },
  {
    id: "home-finds",
    name: "Watch Vendor",
    category: "Watches",
    price: 9.99,
    deliveryFile: "Watch Email.png",
    whatYouGet: ["100+ Luxury Brand Watchs"],
    deliveryLinks: ["https://replace-with-your-watch-vendor-link.com"]
  }
];

const env = {
  port: Number(process.env.PORT || 3000),
  siteUrl: process.env.SITE_URL || "http://localhost:3000",
  paypalEnv: process.env.PAYPAL_ENV === "sandbox" ? "sandbox" : "live",
  paypalClientId: process.env.PAYPAL_CLIENT_ID || "",
  paypalClientSecret: process.env.PAYPAL_CLIENT_SECRET || "",
  paypalWebhookId: process.env.PAYPAL_WEBHOOK_ID || "",
  defaultCurrency: (process.env.DEFAULT_CURRENCY || "CAD").toUpperCase(),
  allowTestCharge: process.env.ALLOW_TEST_CHARGE === "true",
  adminToken: process.env.ADMIN_DASH_TOKEN || "",
  smtpHost: process.env.SMTP_HOST || "",
  smtpPort: Number(process.env.SMTP_PORT || 587),
  smtpSecure: process.env.SMTP_SECURE === "true",
  smtpUser: process.env.SMTP_USER || "",
  smtpPass: process.env.SMTP_PASS || "",
  fromEmail: process.env.FROM_EMAIL || "TheResellPlug <no-reply@theresellplug.com>"
};

const paypalBaseUrl =
  env.paypalEnv === "sandbox" ? "https://api-m.sandbox.paypal.com" : "https://api-m.paypal.com";

const hasMailConfig = Boolean(env.smtpHost && env.smtpUser && env.smtpPass);
const transporter = hasMailConfig
  ? nodemailer.createTransport({
      host: env.smtpHost,
      port: env.smtpPort,
      secure: env.smtpSecure,
      auth: {
        user: env.smtpUser,
        pass: env.smtpPass
      }
    })
  : null;

function nowIso() {
  return new Date().toISOString();
}

function findVendor(vendorId) {
  return vendors.find((vendor) => vendor.id === vendorId);
}

function generateToken() {
  return crypto.randomBytes(24).toString("hex");
}

function formatMoney(amount, currency) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency
  }).format(Number(amount));
}

function getDeliveryFilePath(vendor) {
  if (!vendor?.deliveryFile) return null;
  const filePath = path.join(rootDir, vendor.deliveryFile);
  return fs.existsSync(filePath) ? filePath : null;
}

function getBrandLogoPath() {
  const candidates = [
    "Logo Image.png",
    "TheResellPlug Logo.png",
    "theresellplug-logo.png",
    "brand-logo.png",
    "Logo.png",
    "logo.png"
  ];

  for (const filename of candidates) {
    const filePath = path.join(rootDir, filename);
    if (fs.existsSync(filePath)) return filePath;
  }

  return null;
}

async function getPayPalAccessToken() {
  if (!env.paypalClientId || !env.paypalClientSecret) {
    throw new Error("PayPal credentials are missing in environment variables.");
  }

  const auth = Buffer.from(`${env.paypalClientId}:${env.paypalClientSecret}`).toString("base64");
  const response = await fetch(`${paypalBaseUrl}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: "grant_type=client_credentials"
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to fetch PayPal access token: ${text}`);
  }

  const data = await response.json();
  return data.access_token;
}

async function paypalRequest(endpoint, method, accessToken, body) {
  const response = await fetch(`${paypalBaseUrl}${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new Error(`PayPal API error (${endpoint}): ${text}`);
  }

  return data;
}

async function sendDeliveryEmail(order, vendor) {
  if (!transporter) return false;

  const downloadUrl = `${env.siteUrl}/download/${order.download_token}`;
  const deliveryFilePath = getDeliveryFilePath(vendor);
  const brandLogoPath = getBrandLogoPath();
  const logoCid = "theresellplug-logo";
  const attachments = [];
  if (deliveryFilePath) {
    attachments.push({
      filename: path.basename(deliveryFilePath),
      path: deliveryFilePath
    });
  }
  if (brandLogoPath) {
    attachments.push({
      filename: path.basename(brandLogoPath),
      path: brandLogoPath,
      cid: logoCid
    });
  }
  const links = vendor.deliveryLinks || [];
  const linksHtml = links.length
    ? `<ul>${links
        .map((link) => `<li><a href="${link}" target="_blank" rel="noopener">${link}</a></li>`)
        .join("")}</ul>`
    : "<p>No delivery links configured yet.</p>";
  const html = `
    <div style="font-family: Arial, sans-serif; color: #111; line-height: 1.5;">
      ${brandLogoPath ? `<p><img src="cid:${logoCid}" alt="TheResellPlug logo" style="width:84px;height:84px;border-radius:999px;display:block;" /></p>` : ""}
      <h2>Your TheResellPlug digital file is ready</h2>
      <p>Order ID: <strong>${order.capture_id || order.paypal_order_id}</strong></p>
      <p>Product: <strong>${vendor.name}</strong></p>
      <p>Amount: <strong>${formatMoney(order.amount, order.currency)}</strong></p>
      <p><strong>Your Links:</strong></p>
      ${linksHtml}
      <p><a href="${downloadUrl}">Download your vendor list</a></p>
      <p>This is a digital product. No physical shipment will be sent.</p>
    </div>
  `;

  await transporter.sendMail({
    from: env.fromEmail,
    to: order.buyer_email,
    subject: `Your download: ${vendor.name}`,
    html,
    attachments
  });

  return true;
}

function getOrderByPayPalOrderId(paypalOrderId) {
  return db
    .prepare("SELECT * FROM orders WHERE paypal_order_id = ? ORDER BY id DESC LIMIT 1")
    .get(paypalOrderId);
}

function getOrderByCaptureId(captureId) {
  return db.prepare("SELECT * FROM orders WHERE capture_id = ? ORDER BY id DESC LIMIT 1").get(captureId);
}

function getOrderByToken(token) {
  return db.prepare("SELECT * FROM orders WHERE download_token = ? ORDER BY id DESC LIMIT 1").get(token);
}

function upsertCreatedOrder({ paypalOrderId, vendor, buyerEmail, amount, currency }) {
  const existing = getOrderByPayPalOrderId(paypalOrderId);
  const timestamp = nowIso();

  if (existing) {
    db.prepare(
      `
      UPDATE orders
      SET buyer_email = ?, amount = ?, currency = ?, status = 'CREATED', updated_at = ?
      WHERE paypal_order_id = ?
    `
    ).run(buyerEmail, String(amount), currency, timestamp, paypalOrderId);
    return;
  }

  db.prepare(
    `
    INSERT INTO orders (
      paypal_order_id, vendor_id, vendor_name, vendor_category, buyer_email,
      amount, currency, status, verified, email_sent, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'CREATED', 0, 0, ?, ?)
  `
  ).run(paypalOrderId, vendor.id, vendor.name, vendor.category, buyerEmail, String(amount), currency, timestamp, timestamp);
}

function updateCapturedOrder({ paypalOrderId, captureId, paymentSource, payerName, rawCaptureJson }) {
  const existing = getOrderByPayPalOrderId(paypalOrderId);
  if (!existing) return;

  const token = existing.download_token || generateToken();

  db.prepare(
    `
    UPDATE orders
    SET capture_id = ?, payment_source = ?, payer_name = ?, raw_capture_json = ?,
        download_token = ?, status = 'CAPTURED', updated_at = ?
    WHERE paypal_order_id = ?
  `
  ).run(captureId, paymentSource, payerName, rawCaptureJson, token, nowIso(), paypalOrderId);
}

function markVerifiedByCapture(captureId) {
  const order = getOrderByCaptureId(captureId);
  if (!order) return null;

  db.prepare("UPDATE orders SET verified = 1, status = 'COMPLETED', updated_at = ? WHERE id = ?").run(nowIso(), order.id);
  return db.prepare("SELECT * FROM orders WHERE id = ?").get(order.id);
}

function markEmailSent(orderId) {
  db.prepare("UPDATE orders SET email_sent = 1, updated_at = ? WHERE id = ?").run(nowIso(), orderId);
}

app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf.toString("utf8");
    }
  })
);

app.use(express.static(rootDir));

app.get("/api/config", (req, res) => {
  res.json({
    paypalClientId: env.paypalClientId,
    defaultCurrency: env.defaultCurrency,
    paypalEnv: env.paypalEnv,
    siteUrl: env.siteUrl
  });
});

app.post("/api/paypal/create-order", async (req, res) => {
  try {
    const { vendorId, buyerEmail, testCharge } = req.body || {};

    if (!vendorId || !buyerEmail) {
      return res.status(400).json({ error: "vendorId and buyerEmail are required." });
    }

    const vendor = findVendor(vendorId);
    if (!vendor) {
      return res.status(404).json({ error: "Vendor not found." });
    }

    const chargeCurrency = "USD";
    const amount = testCharge && env.allowTestCharge ? 1 : vendor.price;

    const accessToken = await getPayPalAccessToken();
    const order = await paypalRequest("/v2/checkout/orders", "POST", accessToken, {
      intent: "CAPTURE",
      purchase_units: [
        {
          description: vendor.name,
          custom_id: vendor.id,
          amount: {
            currency_code: chargeCurrency,
            value: amount.toFixed(2)
          }
        }
      ],
      application_context: {
        shipping_preference: "NO_SHIPPING",
        user_action: "PAY_NOW"
      }
    });

    upsertCreatedOrder({
      paypalOrderId: order.id,
      vendor,
      buyerEmail,
      amount: amount.toFixed(2),
      currency: chargeCurrency
    });

    return res.json({
      id: order.id,
      amount: amount.toFixed(2),
      currency: chargeCurrency
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post("/api/paypal/capture-order", async (req, res) => {
  try {
    const { orderID } = req.body || {};

    if (!orderID) {
      return res.status(400).json({ error: "orderID is required." });
    }

    const existing = getOrderByPayPalOrderId(orderID);
    if (!existing) {
      return res.status(404).json({ error: "Order not found in database." });
    }

    const accessToken = await getPayPalAccessToken();
    const capture = await paypalRequest(`/v2/checkout/orders/${orderID}/capture`, "POST", accessToken, {});

    const captureId =
      capture.purchase_units?.[0]?.payments?.captures?.[0]?.id || capture.id || `CAP-${Date.now()}`;
    const paymentSource = Object.keys(capture.payment_source || {})[0] || "paypal";
    const payerName = capture.payer?.name?.given_name || capture.payer?.name?.surname || "Customer";

    updateCapturedOrder({
      paypalOrderId: orderID,
      captureId,
      paymentSource,
      payerName,
      rawCaptureJson: JSON.stringify(capture)
    });

    const updated = getOrderByPayPalOrderId(orderID);
    const vendor = findVendor(updated.vendor_id);

    if (vendor && !updated.email_sent) {
      try {
        const sent = await sendDeliveryEmail(updated, vendor);
        if (sent) {
          markEmailSent(updated.id);
        }
      } catch (mailError) {
        console.error("Email delivery failed:", mailError.message);
      }
    }

    return res.json({
      ok: true,
      order: {
        vendorId: updated.vendor_id,
        email: updated.buyer_email,
        orderId: updated.capture_id || updated.paypal_order_id,
        amount: updated.amount,
        currency: updated.currency,
        paymentProvider: updated.payment_source ? `PayPal (${updated.payment_source})` : "PayPal",
        payerName: updated.payer_name,
        verified: Boolean(updated.verified),
        downloadUrl: `${env.siteUrl}/download/${updated.download_token}`
      }
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post("/api/paypal/webhook", async (req, res) => {
  try {
    if (!env.paypalWebhookId) {
      return res.status(500).json({ error: "PAYPAL_WEBHOOK_ID is not configured." });
    }

    const accessToken = await getPayPalAccessToken();
    const verifyPayload = {
      auth_algo: req.get("paypal-auth-algo"),
      cert_url: req.get("paypal-cert-url"),
      transmission_id: req.get("paypal-transmission-id"),
      transmission_sig: req.get("paypal-transmission-sig"),
      transmission_time: req.get("paypal-transmission-time"),
      webhook_id: env.paypalWebhookId,
      webhook_event: req.body
    };

    const verify = await paypalRequest(
      "/v1/notifications/verify-webhook-signature",
      "POST",
      accessToken,
      verifyPayload
    );

    if (verify.verification_status !== "SUCCESS") {
      return res.status(400).json({ error: "Webhook signature verification failed." });
    }

    const eventType = req.body?.event_type;

    if (eventType === "PAYMENT.CAPTURE.COMPLETED") {
      const captureId = req.body?.resource?.id;
      const orderId = req.body?.resource?.supplementary_data?.related_ids?.order_id;

      let order = captureId ? markVerifiedByCapture(captureId) : null;
      if (!order && orderId) {
        const fallback = getOrderByPayPalOrderId(orderId);
        if (fallback && fallback.capture_id) {
          order = markVerifiedByCapture(fallback.capture_id);
        }
      }

      if (order && !order.email_sent) {
        const vendor = findVendor(order.vendor_id);
        if (vendor) {
          try {
            const sent = await sendDeliveryEmail(order, vendor);
            if (sent) {
              markEmailSent(order.id);
            }
          } catch (mailError) {
            console.error("Webhook email delivery failed:", mailError.message);
          }
        }
      }
    }

    return res.json({ received: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get("/download/:token", (req, res) => {
  const order = getOrderByToken(req.params.token);
  if (!order) {
    return res.status(404).send("Invalid download token.");
  }

  if (order.status !== "CAPTURED" && order.status !== "COMPLETED") {
    return res.status(403).send("Order is not eligible for download.");
  }

  const vendor = findVendor(order.vendor_id);
  if (!vendor) {
    return res.status(404).send("Vendor data not found.");
  }

  const deliveryFilePath = getDeliveryFilePath(vendor);
  if (deliveryFilePath) {
    return res.download(deliveryFilePath, path.basename(deliveryFilePath));
  }

  const payload = [
    `TheResellPlug - ${vendor.name}`,
    `Category: ${vendor.category}`,
    `Order ID: ${order.capture_id || order.paypal_order_id}`,
    `Purchased: ${order.created_at}`,
    "",
    "What you get:",
    ...vendor.whatYouGet.map((item) => `- ${item}`),
    "",
    "Vendor links:",
    ...(vendor.deliveryLinks || []).map((link) => `- ${link}`),
    "",
    "Digital product disclaimer: informational supplier file, non-refundable after delivery."
  ].join("\n");

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${vendor.id}-vendor-list.txt"`);
  return res.send(payload);
});

function requireAdmin(req, res, next) {
  if (!env.adminToken) {
    return res.status(500).json({ error: "ADMIN_DASH_TOKEN is not configured." });
  }

  const token = req.get("x-admin-token") || req.query.token;
  if (token !== env.adminToken) {
    return res.status(401).json({ error: "Unauthorized." });
  }

  return next();
}

app.get("/api/admin/orders", requireAdmin, (req, res) => {
  const rows = db
    .prepare(
      `
      SELECT
        id, paypal_order_id, capture_id, vendor_id, vendor_name, vendor_category,
        buyer_email, amount, currency, status, verified, email_sent,
        payment_source, payer_name, created_at, updated_at
      FROM orders
      ORDER BY id DESC
      LIMIT 300
    `
    )
    .all();

  return res.json({ orders: rows });
});

app.listen(env.port, () => {
  console.log(`TheResellPlug server running at ${env.siteUrl} (port ${env.port})`);
  console.log(`PayPal mode: ${env.paypalEnv}`);
});

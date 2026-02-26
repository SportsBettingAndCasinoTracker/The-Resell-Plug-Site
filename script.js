let runtimeConfig = null;

function buildVendorCard(vendor) {
  return `
    <article class="card vendor-card">
      <img class="vendor-image" src="${vendor.image}" alt="${vendor.name}" loading="lazy" />
      <div class="vendor-body">
        <div class="vendor-top">
          <span class="category-tag">${vendor.category}</span>
          <span class="price">${formatPrice(vendor.price)}</span>
        </div>
        <h3>${vendor.name}</h3>
        <div class="vendor-actions">
          <a class="btn btn-secondary" href="vendor.html?id=${vendor.id}">View</a>
        </div>
      </div>
    </article>
  `;
}

function renderFeatured() {
  const container = document.getElementById("featured-vendors");
  if (!container) return;
  container.innerHTML = vendors.slice(0, 3).map(buildVendorCard).join("");
}

function renderAllVendors() {
  const container = document.getElementById("all-vendors");
  if (!container) return;
  container.innerHTML = vendors.map(buildVendorCard).join("");
}

function renderVendorDetail() {
  const root = document.getElementById("vendor-detail");
  if (!root) return;

  const id = new URLSearchParams(window.location.search).get("id") || vendors[0].id;
  const vendor = getVendorById(id) || vendors[0];

  root.innerHTML = `
    <img src="${vendor.image}" alt="${vendor.name}" />
    <div class="card">
      <div class="product-head">
        <h1>${vendor.name}</h1>
        <span class="price">${formatPrice(vendor.price)}</span>
      </div>
      <p><strong>Category:</strong> ${vendor.category}</p>
      <h3>What You Get</h3>
      <ul class="check-list">
        ${vendor.whatYouGet.map((item) => `<li>${item}</li>`).join("")}
      </ul>
      <p class="product-disclaimer">
        <strong>Disclaimer:</strong> This is a digital product. No physical item will be shipped.
      </p>
      <div class="vendor-actions">
        <a class="btn btn-primary" href="checkout.html?id=${vendor.id}">Buy Now</a>
      </div>
      <p class="small">Instant download delivery + email delivery included.</p>
    </div>
  `;
}

async function fetchRuntimeConfig() {
  if (runtimeConfig) return runtimeConfig;

  const response = await fetch("/api/config");
  if (!response.ok) {
    throw new Error("Unable to load server configuration.");
  }

  runtimeConfig = await response.json();
  return runtimeConfig;
}

async function loadPayPalSdk(clientId, currency) {
  if (window.paypal) return;

  await new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src =
      `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}` +
      `&currency=${encodeURIComponent(currency)}` +
      "&intent=capture&components=buttons&enable-funding=card,venmo,paylater";
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error("Failed to load PayPal SDK."));
    document.head.appendChild(script);
  });
}

async function renderCheckoutSummary() {
  const root = document.getElementById("checkout-summary");
  if (!root) return;

  const params = new URLSearchParams(window.location.search);
  const id = params.get("id") || vendors[0].id;
  const testCharge = params.get("testCharge") === "1";
  const vendor = getVendorById(id) || vendors[0];
  const form = document.getElementById("checkout-form");
  const emailInput = document.getElementById("buyer-email");
  const paypalNote = document.getElementById("paypal-note");
  const paypalButtonRoot = document.getElementById("paypal-button-container");
  const cardButtonRoot = document.getElementById("card-button-container");

  const safeNote = (message) => {
    if (paypalNote) paypalNote.textContent = message;
  };

  if (!form || !emailInput || !paypalButtonRoot || !cardButtonRoot) return;

  try {
    const config = await fetchRuntimeConfig();
    const currency = "USD";
    const displayAmount = testCharge ? 1 : vendor.price;
    const formattedCheckoutAmount = new Intl.NumberFormat("en-CA", {
      style: "currency",
      currency
    }).format(displayAmount);

    root.innerHTML = `
      <h3>Order Summary</h3>
      <p><strong>${vendor.name}</strong></p>
      <p>${vendor.category}</p>
      <p class="price">${formattedCheckoutAmount}</p>
      ${testCharge ? '<p class="small"><strong>Test charge mode:</strong> This order is set to 1.00.</p>' : ""}
      <hr />
      <p class="small">Delivery: Instant file access + email delivery</p>
      <p class="small">Type: Digital product (final sale)</p>
      <p class="small">If email isn’t in inbox, check spam/promotions.</p>
      <div class="badges">
        <span>SSL Secure</span>
        <span>Server Verified</span>
        <span>PayPal + Card</span>
      </div>
    `;

    if (!config.paypalClientId) {
      safeNote("PayPal is not configured on the server. Add PAYPAL_CLIENT_ID and refresh.");
      return;
    }

    await loadPayPalSdk(config.paypalClientId, currency);

    safeNote("Pay with PayPal or debit/credit. Delivery is sent after verified capture.");

    const createServerOrder = async () => {
      const buyerEmail = emailInput.value.trim();
      if (!buyerEmail) {
        emailInput.focus();
        throw new Error("Email is required before payment.");
      }

      const response = await fetch("/api/paypal/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendorId: vendor.id,
          buyerEmail,
          currency,
          testCharge
        })
      });

      const data = await response.json();
      if (!response.ok || !data.id) {
        throw new Error(data.error || "Failed to create order.");
      }

      return data.id;
    };

    const captureServerOrder = async (orderID, providerLabel) => {
      const response = await fetch("/api/paypal/capture-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderID })
      });

      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Failed to capture order.");
      }

      const order = {
        ...data.order,
        paymentProvider: providerLabel || data.order.paymentProvider
      };

      localStorage.setItem("resellPlugOrder", JSON.stringify(order));
      window.location.href = "success.html";
    };

    const paypalButtons = window.paypal.Buttons({
      style: {
        layout: "vertical",
        shape: "rect",
        color: "gold",
        label: "paypal"
      },
      createOrder: () => createServerOrder(),
      onApprove: (data) =>
        captureServerOrder(data.orderID, "PayPal").catch((error) => {
          safeNote(error.message || "Payment captured, but confirmation failed. Please contact support.");
        }),
      onError: (error) => {
        safeNote(error.message || "Payment failed. Please retry.");
      }
    });

    if (paypalButtons.isEligible()) {
      paypalButtons.render("#paypal-button-container");
    }

    const cardButtons = window.paypal.Buttons({
      fundingSource: window.paypal.FUNDING.CARD,
      style: {
        layout: "vertical",
        shape: "rect",
        color: "black",
        label: "pay"
      },
      createOrder: () => createServerOrder(),
      onApprove: (data) =>
        captureServerOrder(data.orderID, "PayPal Card").catch((error) => {
          safeNote(error.message || "Payment captured, but confirmation failed. Please contact support.");
        }),
      onError: (error) => {
        safeNote(error.message || "Card payment failed. Try another funding method.");
      }
    });

    if (cardButtons.isEligible()) {
      cardButtons.render("#card-button-container");
    }
  } catch (error) {
    safeNote(error.message || "Checkout initialization failed.");
  }
}

function renderSuccess() {
  const root = document.getElementById("success-content");
  if (!root) return;

  const rawOrder = localStorage.getItem("resellPlugOrder");
  if (!rawOrder) {
    root.innerHTML = `
      <h1>No Order Found</h1>
      <p>Please complete checkout to access your digital files.</p>
      <a class="btn btn-primary" href="all-vendors.html">Browse Vendors</a>
    `;
    return;
  }

  const order = JSON.parse(rawOrder);
  const vendor = getVendorById(order.vendorId) || vendors[0];
  const downloadHref = order.downloadUrl || "#";

  root.innerHTML = `
    <h1>Purchase Complete</h1>
    <p><strong>Order:</strong> ${order.orderId}</p>
    <p><strong>Product:</strong> ${vendor.name}</p>
    <p><strong>Charged:</strong> ${order.amount} ${order.currency}</p>
    <p><strong>Payment:</strong> ${order.paymentProvider || "PayPal"}</p>
    <p><strong>Email delivery:</strong> Sent to ${order.email}</p>
    <p class="small">If email isn’t in inbox, check spam/promotions.</p>
    <p><strong>Verification:</strong> ${order.verified ? "Webhook verified" : "Capture completed"}</p>
    <p>Your secure file is ready now:</p>
    <div class="vendor-actions">
      <a class="btn btn-primary" href="${downloadHref}" target="_blank" rel="noopener">Download Vendor File</a>
      <a class="btn btn-secondary" href="all-vendors.html">Continue Shopping</a>
    </div>
    <p class="small">Digital product disclaimer: informational supplier file, non-refundable after delivery.</p>
  `;
}

function setupAdminDashboard() {
  const loadButton = document.getElementById("load-orders");
  const tokenInput = document.getElementById("admin-token");
  const body = document.getElementById("orders-body");
  const note = document.getElementById("admin-note");

  if (!loadButton || !tokenInput || !body || !note) return;

  loadButton.addEventListener("click", async () => {
    const token = tokenInput.value.trim();
    if (!token) {
      note.textContent = "Enter your admin token.";
      return;
    }

    note.textContent = "Loading orders...";

    try {
      const response = await fetch("/api/admin/orders", {
        headers: {
          "x-admin-token": token
        }
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to load orders.");
      }

      if (!data.orders.length) {
        body.innerHTML = '<tr><td colspan="9">No orders yet.</td></tr>';
      } else {
        body.innerHTML = data.orders
          .map(
            (order) => `
          <tr>
            <td>${order.id}</td>
            <td>${order.capture_id || order.paypal_order_id}</td>
            <td>${order.buyer_email}</td>
            <td>${order.vendor_name}</td>
            <td>${order.amount} ${order.currency}</td>
            <td>${order.status}</td>
            <td>${order.verified ? "Yes" : "No"}</td>
            <td>${order.email_sent ? "Yes" : "No"}</td>
            <td>${new Date(order.created_at).toLocaleString()}</td>
          </tr>
        `
          )
          .join("");
      }

      note.textContent = `Loaded ${data.orders.length} orders.`;
    } catch (error) {
      note.textContent = error.message || "Dashboard request failed.";
    }
  });
}

function setupContactForm() {
  const form = document.getElementById("contact-form");
  const note = document.getElementById("contact-note");
  if (!form || !note) return;

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    note.textContent = "Message received. Our team will reply within 24 hours.";
    form.reset();
  });
}

function setupBrandLogo() {
  const brandAnchors = document.querySelectorAll(".brand");
  if (!brandAnchors.length) return;

  const logoCandidates = [
    "/Logo Image.png",
    "/TheResellPlug Logo.png",
    "/theresellplug-logo.png",
    "/brand-logo.png",
    "/Logo.png",
    "/logo.png"
  ];

  function applyLogo(src) {
    brandAnchors.forEach((anchor) => {
      anchor.innerHTML = `<img class="brand-logo" src="${src}" alt="TheResellPlug logo" /><span>TheResellPlug</span>`;
    });
  }

  function tryNext(index) {
    if (index >= logoCandidates.length) return;
    const img = new Image();
    img.onload = () => applyLogo(logoCandidates[index]);
    img.onerror = () => tryNext(index + 1);
    img.src = logoCandidates[index];
  }

  tryNext(0);
}

function setupNav() {
  const toggle = document.querySelector(".menu-toggle");
  const nav = document.querySelector(".nav");
  if (!toggle || !nav) return;

  toggle.addEventListener("click", () => {
    nav.classList.toggle("open");
  });

  nav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => nav.classList.remove("open"));
  });
}

function setupRevealAnimations() {
  const items = document.querySelectorAll(".reveal");
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("in");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12 }
  );

  items.forEach((item) => observer.observe(item));
}

function setYear() {
  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();
}

renderFeatured();
renderAllVendors();
renderVendorDetail();
renderCheckoutSummary();
renderSuccess();
setupAdminDashboard();
setupContactForm();
setupBrandLogo();
setupNav();
setupRevealAnimations();
setYear();

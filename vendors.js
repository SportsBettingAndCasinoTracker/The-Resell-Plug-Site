const vendors = [
  {
    id: "starter-bundle",
    name: "Elite Supplier Bundle",
    category: "Bundle",
    price: 37.99,
    image: "/Elite%20Supplier%20Bundle%20Image.png",
    whatYouGet: [
      "Clothing Vendor",
      "Cologne Vendor",
      "Electronic Vendor",
      "Receipt Vendor",
      "Watch Vendor"
    ],
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
    image: "/Clothing%20Vendor%20Image.png",
    whatYouGet: ["1,000+ Different types of clothing, Jackets, and Jewellery"],
    deliveryLinks: ["https://replace-with-your-clothing-vendor-link.com"]
  },
  {
    id: "sneaker-source",
    name: "Cologne Vendor",
    category: "Cologne",
    price: 9.99,
    image: "/Cologne%20Vendor%20Image.png",
    whatYouGet: ["Over 300+ Different Types of Cologne & Perfume"],
    deliveryLinks: ["https://replace-with-your-cologne-vendor-link.com"]
  },
  {
    id: "tech-electronics",
    name: "Electronic Vendor",
    category: "Electronics",
    price: 9.99,
    image: "/Electronic%20Vendor%20Image.png",
    whatYouGet: [
      "Airpod (2,3,4)",
      "Airpod Maxes",
      "JBL Speaker",
      "Dyson",
      "Beats"
    ],
    deliveryLinks: ["https://replace-with-your-electronic-vendor-link.com"]
  },
  {
    id: "beauty-glow",
    name: "Receipt Vendor",
    category: "Reciepts",
    price: 9.99,
    image: "/Receipt%20Vendor%20Image%20.png",
    whatYouGet: ["100+ DIfferent Store Receipts"],
    deliveryLinks: ["https://replace-with-your-receipt-vendor-link.com"]
  },
  {
    id: "home-finds",
    name: "Watch Vendor",
    category: "Watches",
    price: 9.99,
    image: "/Watch%20Vendor%20Image.png",
    whatYouGet: ["100+ Luxury Brand Watchs"],
    deliveryLinks: ["https://replace-with-your-watch-vendor-link.com"]
  }
];

function formatPrice(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(value);
}

function getVendorById(id) {
  return vendors.find((vendor) => vendor.id === id);
}

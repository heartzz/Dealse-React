import "dotenv/config";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";
import {
  AccountRole,
  DealStatus,
  MembershipRole,
  MembershipStatus,
  OfferType,
  ProductStatus,
  RetailerStatus,
  StoreStatus,
  UserStatus,
} from "../src/generated/prisma/enums.js";

type RetailerSeed = {
  key: string;
  name: string;
  store: string;
  category: string;
  locality: string;
  address: string;
  description: string;
  latitude: number;
  longitude: number;
};

type ProductSeed = {
  key: string;
  retailer: string;
  category: string;
  name: string;
  description: string;
  brand: string;
};

type DealSeed = {
  key: string;
  retailer: string;
  category: string;
  product: string;
  title: string;
  summary: string;
  details: string;
  terms: string;
  image: string;
  alt: string;
  offerType: "PERCENTAGE" | "FIXED_AMOUNT" | "BUY_X_GET_Y";
  discountBps?: number;
  discountRupees?: number;
  originalRupees?: number;
  offerRupees?: number;
};

const retailers: RetailerSeed[] = [
  { key: "aavaran-edit", name: "Aavaran Edit · Demo", store: "Aavaran Edit", category: "fashion-accessories", locality: "Navrangpura", address: "Demo Market, University Road", description: "DEMO CATALOGUE: Fictional Ahmedabad boutique for marketplace evaluation.", latitude: 23.0395, longitude: 72.5612 },
  { key: "raahi-textiles", name: "Raahi Textiles · Demo", store: "Raahi Textiles", category: "fashion-accessories", locality: "Satellite", address: "Demo Arcade, Jodhpur Cross Road", description: "DEMO CATALOGUE: Fictional textile and apparel store for marketplace evaluation.", latitude: 23.0257, longitude: 72.5175 },
  { key: "copper-kettle", name: "Copper Kettle Cafe · Demo", store: "Copper Kettle Cafe", category: "food-beverages", locality: "Vastrapur", address: "Demo Corner, Vastrapur Lake Road", description: "DEMO CATALOGUE: Fictional neighborhood cafe for marketplace evaluation.", latitude: 23.0390, longitude: 72.5293 },
  { key: "saffron-courtyard", name: "Saffron Courtyard · Demo", store: "Saffron Courtyard", category: "food-beverages", locality: "Prahlad Nagar", address: "Demo Plaza, Corporate Road", description: "DEMO CATALOGUE: Fictional family dining room for marketplace evaluation.", latitude: 23.0120, longitude: 72.5105 },
  { key: "orbit-audio", name: "Orbit Audio House · Demo", store: "Orbit Audio House", category: "electronics", locality: "SG Highway", address: "Demo Trade Centre, SG Highway", description: "DEMO CATALOGUE: Fictional electronics shop for marketplace evaluation.", latitude: 23.0450, longitude: 72.5150 },
  { key: "glow-theory", name: "Glow Theory Studio · Demo", store: "Glow Theory Studio", category: "beauty-wellness", locality: "Bodakdev", address: "Demo Square, Bodakdev", description: "DEMO CATALOGUE: Fictional beauty and personal care studio for marketplace evaluation.", latitude: 23.0398, longitude: 72.5085 },
  { key: "freshlane-market", name: "Freshlane Market · Demo", store: "Freshlane Market", category: "grocery-supermarket", locality: "Maninagar", address: "Demo Market Road, Maninagar", description: "DEMO CATALOGUE: Fictional neighborhood grocery market for marketplace evaluation.", latitude: 22.9950, longitude: 72.6040 },
  { key: "mitti-loom", name: "Mitti & Loom Living · Demo", store: "Mitti & Loom Living", category: "home-living", locality: "Bopal", address: "Demo Living Lane, South Bopal", description: "DEMO CATALOGUE: Fictional home and lifestyle shop for marketplace evaluation.", latitude: 23.0300, longitude: 72.4650 },
  { key: "stride-local", name: "Stride Local Footwear · Demo", store: "Stride Local Footwear", category: "footwear", locality: "Satellite", address: "Demo Walk, Anandnagar Road", description: "DEMO CATALOGUE: Fictional independent footwear shop for marketplace evaluation.", latitude: 23.0175, longitude: 72.5100 },
  { key: "move-well", name: "Move Well Studio · Demo", store: "Move Well Studio", category: "sports-fitness", locality: "Prahlad Nagar", address: "Demo Wellness Hub, Prahlad Nagar", description: "DEMO CATALOGUE: Fictional fitness and wellness studio for marketplace evaluation.", latitude: 23.0060, longitude: 72.5060 },
];

const products: ProductSeed[] = [
  { key: "aavaran-kurta", retailer: "aavaran-edit", category: "fashion-accessories", name: "Embroidered Cotton Kurta", description: "Breathable cotton with subtle hand-finished embroidery.", brand: "Aavaran Edit" },
  { key: "aavaran-dupatta", retailer: "aavaran-edit", category: "fashion-accessories", name: "Handwoven Occasion Dupatta", description: "Lightweight woven dupatta with a soft festive border.", brand: "Aavaran Edit" },
  { key: "raahi-linen", retailer: "raahi-textiles", category: "fashion-accessories", name: "Everyday Linen Shirt", description: "Easy-fit linen blend for warm Ahmedabad afternoons.", brand: "Raahi Studio" },
  { key: "raahi-saree", retailer: "raahi-textiles", category: "fashion-accessories", name: "Festive Weave Saree", description: "A dressy woven saree with a coordinated blouse piece.", brand: "Raahi Studio" },
  { key: "copper-iced-latte", retailer: "copper-kettle", category: "food-beverages", name: "House Iced Latte", description: "Fresh espresso, chilled milk and a choice of regular or oat milk.", brand: "Copper Kettle" },
  { key: "copper-brunch", retailer: "copper-kettle", category: "food-beverages", name: "Cafe Brunch Plate", description: "Eggs or paneer, toast, salad and a small house coffee.", brand: "Copper Kettle" },
  { key: "saffron-family-meal", retailer: "saffron-courtyard", category: "food-beverages", name: "Weekend Family Meal", description: "A shareable vegetarian meal for a family of four.", brand: "Saffron Courtyard" },
  { key: "saffron-chai", retailer: "saffron-courtyard", category: "food-beverages", name: "Masala Chai & Snack Pair", description: "House masala chai served with a freshly prepared savory snack.", brand: "Saffron Courtyard" },
  { key: "orbit-headphones", retailer: "orbit-audio", category: "electronics", name: "Studio Wireless Headphones", description: "Over-ear wireless listening with cushioned ear cups and USB-C charging.", brand: "Orbit Sound" },
  { key: "orbit-powerbank", retailer: "orbit-audio", category: "electronics", name: "Compact 20,000 mAh Power Bank", description: "Dual-output portable charging with USB-C input.", brand: "Orbit Sound" },
  { key: "glow-skincare", retailer: "glow-theory", category: "beauty-wellness", name: "Daily Glow Skincare Set", description: "Gentle cleanser, hydrating serum and daily moisturizer.", brand: "Glow Theory" },
  { key: "glow-sunscreen", retailer: "glow-theory", category: "beauty-wellness", name: "Everyday SPF 50 Sunscreen", description: "Lightweight broad-spectrum sunscreen for daily use.", brand: "Glow Theory" },
  { key: "fresh-pantry", retailer: "freshlane-market", category: "grocery-supermarket", name: "Weekly Pantry Essentials Box", description: "A practical mix of grains, pulses and cooking staples.", brand: "Freshlane Select" },
  { key: "fresh-produce", retailer: "freshlane-market", category: "grocery-supermarket", name: "Seasonal Produce Basket", description: "A rotating basket of fresh seasonal vegetables and fruit.", brand: "Freshlane Select" },
  { key: "mitti-vase", retailer: "mitti-loom", category: "home-living", name: "Hand-finished Ceramic Vase", description: "Small-batch ceramic vase with a warm matte glaze.", brand: "Mitti & Loom" },
  { key: "mitti-basket", retailer: "mitti-loom", category: "home-living", name: "Woven Storage Basket", description: "Handwoven natural-fibre basket for everyday home storage.", brand: "Mitti & Loom" },
  { key: "stride-sandals", retailer: "stride-local", category: "footwear", name: "Embroidered Leather Sandals", description: "Comfort-focused sandals with hand-finished textile detailing.", brand: "Stride Local" },
  { key: "stride-sneakers", retailer: "stride-local", category: "footwear", name: "Everyday Court Sneakers", description: "Lightweight low-profile sneakers for daily wear.", brand: "Stride Local" },
  { key: "move-yoga-mat", retailer: "move-well", category: "sports-fitness", name: "Cushioned Yoga Mat", description: "Textured, easy-clean mat for home and studio practice.", brand: "Move Well" },
  { key: "move-class-pack", retailer: "move-well", category: "sports-fitness", name: "Three-Class Wellness Pack", description: "A flexible pack for beginner-friendly guided sessions.", brand: "Move Well" },
];

const deals: DealSeed[] = [
  { key: "aavaran-kurta-30", retailer: "aavaran-edit", category: "fashion-accessories", product: "aavaran-kurta", title: "Flat 30% off selected embroidered kurtas", summary: "Refresh your everyday wardrobe with a little extra colour.", details: "Choose from breathable cotton kurtas with thoughtful embroidery and easy silhouettes. The offer applies to the featured kurta collection in store.", terms: "Valid on selected embroidered cotton kurtas only. One offer per bill. Cannot be combined with another discount. While sizes last.", image: "/assets/demo/catalogue/fashion.jpg", alt: "Shopper browsing colourful Indian apparel at a fictional boutique", offerType: "PERCENTAGE", discountBps: 3000, originalRupees: 5000, offerRupees: 3500 },
  { key: "aavaran-dupatta-350", retailer: "aavaran-edit", category: "fashion-accessories", product: "aavaran-dupatta", title: "₹350 off the occasion edit", summary: "Find a finishing layer for festive plans and family gatherings.", details: "Save ₹350 on selected handwoven dupattas from the Aavaran Edit occasion collection.", terms: "Minimum purchase ₹2,000. Applies to selected dupattas only. One redemption per bill.", image: "/assets/demo/catalogue/fashion.jpg", alt: "Handwoven festive apparel at a fictional Ahmedabad boutique", offerType: "FIXED_AMOUNT", discountRupees: 350, originalRupees: 2300, offerRupees: 1950 },
  { key: "raahi-linen-20", retailer: "raahi-textiles", category: "fashion-accessories", product: "raahi-linen", title: "20% off everyday linen styles", summary: "Easy layers for warm days around the city.", details: "Enjoy 20% off selected linen-blend shirts in store, in available colours and sizes.", terms: "Valid on selected linen styles. Excludes new arrivals and alterations. While stock lasts.", image: "/assets/demo/catalogue/fashion.jpg", alt: "Comfortable contemporary clothing in a fictional Ahmedabad shop", offerType: "PERCENTAGE", discountBps: 2000, originalRupees: 4000, offerRupees: 3200 },
  { key: "raahi-saree-700", retailer: "raahi-textiles", category: "fashion-accessories", product: "raahi-saree", title: "₹700 off the festive weave collection", summary: "A considered save on selected occasion sarees.", details: "Save ₹700 on the featured festive weave saree, including its coordinated blouse piece.", terms: "Valid on the featured collection only. One offer per customer. Cannot be combined with other promotions.", image: "/assets/demo/catalogue/fashion.jpg", alt: "Colourful woven sarees at a fictional textile boutique", offerType: "FIXED_AMOUNT", discountRupees: 700, originalRupees: 3500, offerRupees: 2800 },
  { key: "copper-latte-bogo", retailer: "copper-kettle", category: "food-beverages", product: "copper-iced-latte", title: "Buy one, get one on selected coffees", summary: "Bring a friend for your next cafe catch-up.", details: "Order one regular-sized house iced latte and receive a second selected coffee of equal or lower value at no charge.", terms: "Valid for dine-in only, Monday to Friday. Second beverage must be of equal or lower value. One offer per bill.", image: "/assets/demo/catalogue/cafe.jpg", alt: "Coffee and pastry served at a fictional neighborhood cafe", offerType: "BUY_X_GET_Y" },
  { key: "copper-brunch-200", retailer: "copper-kettle", category: "food-beverages", product: "copper-brunch", title: "₹200 off a relaxed brunch for two", summary: "Make a slow weekend morning a little sweeter.", details: "Save ₹200 on two cafe brunch plates ordered together, with vegetarian and egg options available.", terms: "Valid on Saturday and Sunday before 1 pm. Minimum bill ₹899. Drinks are charged separately.", image: "/assets/demo/catalogue/cafe.jpg", alt: "Brunch and coffee in a bright fictional Ahmedabad cafe", offerType: "FIXED_AMOUNT", discountRupees: 200, originalRupees: 899, offerRupees: 699 },
  { key: "saffron-meal-20", retailer: "saffron-courtyard", category: "food-beverages", product: "saffron-family-meal", title: "20% off the weekend family meal", summary: "A generous vegetarian spread for the table.", details: "Save 20% on the featured sharing meal with breads, seasonal mains, rice and dessert for four.", terms: "Valid for dine-in on weekends. Applies to the featured meal only. Drinks and taxes are additional.", image: "/assets/demo/catalogue/thali.jpg", alt: "A generous Indian thali in a fictional family restaurant", offerType: "PERCENTAGE", discountBps: 2000, originalRupees: 1500, offerRupees: 1200 },
  { key: "saffron-chai-bogo", retailer: "saffron-courtyard", category: "food-beverages", product: "saffron-chai", title: "Buy one chai, get a snack on us", summary: "A comforting tea break for two.", details: "Order two house masala chais and receive one selected savory snack at no charge.", terms: "Valid for dine-in only, 3–6 pm daily. Selected snack options only. One offer per table.", image: "/assets/demo/catalogue/thali.jpg", alt: "Indian refreshments at a fictional neighborhood restaurant", offerType: "BUY_X_GET_Y" },
  { key: "orbit-headphones-500", retailer: "orbit-audio", category: "electronics", product: "orbit-headphones", title: "₹500 off studio wireless headphones", summary: "Better listening for commutes, calls and quiet time.", details: "Save ₹500 on the featured over-ear wireless headphones with USB-C charging and cushioned ear cups.", terms: "Valid on the featured model only. Standard manufacturer warranty applies. While stock lasts.", image: "/assets/demo/catalogue/electronics.jpg", alt: "Unbranded wireless headphones displayed in a fictional electronics store", offerType: "FIXED_AMOUNT", discountRupees: 500, originalRupees: 5999, offerRupees: 5499 },
  { key: "orbit-powerbank-20", retailer: "orbit-audio", category: "electronics", product: "orbit-powerbank", title: "20% off compact power banks", summary: "A handy everyday backup for busy days out.", details: "Enjoy 20% off the featured 20,000 mAh dual-output power bank.", terms: "Valid on the featured capacity and model only. One per customer. While stock lasts.", image: "/assets/demo/catalogue/electronics.jpg", alt: "Portable electronics displayed in a fictional local shop", offerType: "PERCENTAGE", discountBps: 2000, originalRupees: 2500, offerRupees: 2000 },
  { key: "glow-skincare-25", retailer: "glow-theory", category: "beauty-wellness", product: "glow-skincare", title: "Flat 25% off the daily glow set", summary: "A simple cleanser, serum and moisturizer routine.", details: "Save 25% on the three-piece Daily Glow set selected by the Glow Theory team.", terms: "For external use only. Valid on the featured set. Follow product labels and discontinue use if irritation occurs.", image: "/assets/demo/catalogue/beauty.jpg", alt: "Unbranded skincare products arranged with botanical ingredients", offerType: "PERCENTAGE", discountBps: 2500, originalRupees: 3200, offerRupees: 2400 },
  { key: "glow-sunscreen-20", retailer: "glow-theory", category: "beauty-wellness", product: "glow-sunscreen", title: "20% off everyday SPF 50", summary: "Pick up a lighter daily essential for sunny commutes.", details: "Get 20% off the featured broad-spectrum SPF 50 sunscreen.", terms: "Valid on the featured size only. Check the product label for directions and reapplication guidance.", image: "/assets/demo/catalogue/beauty.jpg", alt: "Sun care and skincare products in a calm beauty studio", offerType: "PERCENTAGE", discountBps: 2000, originalRupees: 1500, offerRupees: 1200 },
  { key: "fresh-pantry-200", retailer: "freshlane-market", category: "grocery-supermarket", product: "fresh-pantry", title: "₹200 off the pantry essentials box", summary: "Stock up on weekly staples in one easy bundle.", details: "Save ₹200 on a curated box of grains, pulses and everyday cooking essentials.", terms: "Minimum purchase ₹1,499. Contents may vary by availability. No cash alternative.", image: "/assets/demo/catalogue/grocery.jpg", alt: "Fresh produce and pantry staples at a fictional neighborhood market", offerType: "FIXED_AMOUNT", discountRupees: 200, originalRupees: 1499, offerRupees: 1299 },
  { key: "fresh-produce-10", retailer: "freshlane-market", category: "grocery-supermarket", product: "fresh-produce", title: "10% off the seasonal produce basket", summary: "Fresh picks for a week of home cooking.", details: "Save 10% on the rotating seasonal fruit and vegetable basket.", terms: "Basket selection varies with seasonal availability. Valid on one basket per bill.", image: "/assets/demo/catalogue/grocery.jpg", alt: "Seasonal fruits and vegetables at a fictional Ahmedabad market", offerType: "PERCENTAGE", discountBps: 1000, originalRupees: 800, offerRupees: 720 },
  { key: "mitti-living-20", retailer: "mitti-loom", category: "home-living", product: "mitti-basket", title: "20% off woven home accents", summary: "Small details for a calmer, more considered home.", details: "Save 20% on selected woven baskets and natural-fibre storage pieces.", terms: "Valid on selected home accents only. Handmade pieces may have natural variations.", image: "/assets/demo/catalogue/home.jpg", alt: "Handcrafted home accents in a warm fictional Indian living room", offerType: "PERCENTAGE", discountBps: 2000, originalRupees: 2500, offerRupees: 2000 },
  { key: "mitti-vase-300", retailer: "mitti-loom", category: "home-living", product: "mitti-vase", title: "₹300 off the ceramic vase edit", summary: "A handcrafted accent for a shelf, table or bedside.", details: "Save ₹300 on the featured hand-finished ceramic vase.", terms: "Valid on the featured size and glaze only. Each handcrafted item may vary slightly.", image: "/assets/demo/catalogue/home.jpg", alt: "Hand-finished ceramic vases from a fictional homewares shop", offerType: "FIXED_AMOUNT", discountRupees: 300, originalRupees: 1400, offerRupees: 1100 },
  { key: "stride-sandals-35", retailer: "stride-local", category: "footwear", product: "stride-sandals", title: "Flat 35% off selected sandals", summary: "Comfortable everyday pairs with a handcrafted touch.", details: "Enjoy 35% off selected embroidered leather sandals in available sizes.", terms: "Valid on selected styles only. Final sale pairs are excluded. While sizes last.", image: "/assets/demo/catalogue/footwear.jpg", alt: "Hand-finished sandals and sneakers in a fictional footwear shop", offerType: "PERCENTAGE", discountBps: 3500, originalRupees: 3400, offerRupees: 2210 },
  { key: "stride-sneakers-25", retailer: "stride-local", category: "footwear", product: "stride-sneakers", title: "25% off everyday court sneakers", summary: "A versatile pair for errands, commutes and weekend walks.", details: "Save 25% on the featured everyday court sneaker in selected colours.", terms: "Valid on selected colours and sizes only. One pair per customer at the offer price.", image: "/assets/demo/catalogue/footwear.jpg", alt: "Neutral everyday sneakers on display in a fictional footwear boutique", offerType: "PERCENTAGE", discountBps: 2500, originalRupees: 4400, offerRupees: 3300 },
  { key: "move-yoga-15", retailer: "move-well", category: "sports-fitness", product: "move-yoga-mat", title: "15% off cushioned yoga mats", summary: "A grippy, easy-care mat for your next session.", details: "Save 15% on the featured textured yoga mat, suitable for home or studio practice.", terms: "Valid on the featured mat only. Colours depend on current availability.", image: "/assets/demo/catalogue/fitness.jpg", alt: "A woman practicing yoga in a calm fictional Ahmedabad wellness studio", offerType: "PERCENTAGE", discountBps: 1500, originalRupees: 4000, offerRupees: 3400 },
  { key: "move-class-bogo", retailer: "move-well", category: "sports-fitness", product: "move-class-pack", title: "Bring a friend to your first wellness class", summary: "Two introductory spots for the price of one.", details: "Book one introductory session and bring a friend to the same scheduled class at no additional session fee.", terms: "Advance booking required. Valid for first-time visitors on selected classes. Subject to capacity.", image: "/assets/demo/catalogue/fitness.jpg", alt: "A welcoming local wellness studio set up for a yoga class", offerType: "BUY_X_GET_Y" },
];

function stableId(key: string): string {
  const bytes = createHash("sha1").update(`dealse-demo-catalogue:${key}`).digest();
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function requireDevelopmentDatabase(): string {
  if (process.env.NODE_ENV === "production") throw new Error("The demo catalogue seed is disabled in production.");
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL must be configured in apps/api/.env.");
    let parsed: URL;
    let database: string;
  try {
    parsed = new URL(connectionString);
    database = decodeURIComponent(parsed.pathname.slice(1));
  } catch {
    throw new Error("DATABASE_URL is invalid; the demo seed did not connect.");
  }
  if (database !== "dealse_dev") throw new Error("The demo catalogue seed only runs against the dealse_dev database.");
  if (!["localhost", "127.0.0.1", "::1"].includes(parsed.hostname.toLowerCase())) throw new Error("The demo catalogue seed only runs against a local PostgreSQL server.");
  return connectionString;
}

function verifySeedContent() {
  if (retailers.length < 8 || retailers.length > 10 || products.length < 15 || products.length > 20 || deals.length < 15 || deals.length > 20) {
    throw new Error("The demo catalogue must contain 8–10 retailers, 15–20 products, and 15–20 offers.");
  }
  for (const item of deals) {
    const path = item.image.replace(/^\//, "");
    if (!path.startsWith("assets/demo/catalogue/") || !existsSync(resolve(process.cwd(), "../web/public", path))) {
      throw new Error(`A local promotional image is missing for offer ${item.key}.`);
    }
    if (item.originalRupees !== undefined && item.offerRupees !== undefined) {
      const difference = item.originalRupees - item.offerRupees;
      const matches = item.offerType === "PERCENTAGE"
        ? Math.abs(difference * 10_000 - item.originalRupees * item.discountBps!) < item.originalRupees
        : difference === item.discountRupees;
      if (!matches || item.offerRupees <= 0 || item.offerRupees >= item.originalRupees) {
        throw new Error(`The listed price does not match the discount for offer ${item.key}.`);
      }
    }
  }
}

async function resolveRetailerUser(prisma: PrismaClient): Promise<string> {
  const configured = process.env.DEALSE_DEMO_RETAILER_USER_ID?.trim();
  if (configured) {
    const user = await prisma.user.findFirst({
      where: { id: configured, status: UserStatus.ACTIVE, accountRoles: { some: { role: AccountRole.RETAILER } } },
      select: { id: true },
    });
    if (!user) throw new Error("DEALSE_DEMO_RETAILER_USER_ID must reference an active existing retailer user in dealse_dev.");
    return user.id;
  }

  const candidates = await prisma.user.findMany({
    where: { status: UserStatus.ACTIVE, accountRoles: { some: { role: AccountRole.RETAILER } } },
    select: { id: true },
    take: 2,
  });
  if (candidates.length !== 1) {
    throw new Error("Set DEALSE_DEMO_RETAILER_USER_ID in apps/api/.env to one existing active retailer user ID in dealse_dev; the value is never printed.");
  }
  return candidates[0].id;
}

async function main() {
  const connectionString = requireDevelopmentDatabase();
  verifySeedContent();
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    const userId = await resolveRetailerUser(prisma);
    await prisma.category.upsert({ where: { slug: "grocery-supermarket" }, create: { slug: "grocery-supermarket", name: "Grocery & Supermarket", sortOrder: 25, isActive: true }, update: { name: "Grocery & Supermarket", sortOrder: 25, isActive: true } });
    await prisma.category.upsert({ where: { slug: "footwear" }, create: { slug: "footwear", name: "Footwear", sortOrder: 15, isActive: true }, update: { name: "Footwear", sortOrder: 15, isActive: true } });
    const categorySlugs = [...new Set([...retailers.map((item) => item.category), ...products.map((item) => item.category), ...deals.map((item) => item.category)])];
    const categoryRecords = await prisma.category.findMany({ where: { slug: { in: categorySlugs }, isActive: true }, select: { id: true, slug: true } });
    const categoryIds = new Map(categoryRecords.map((item) => [item.slug, item.id]));
    const missing = categorySlugs.filter((slug) => !categoryIds.has(slug));
    if (missing.length) throw new Error(`Required existing active categories are missing: ${missing.join(", ")}. Apply existing migrations first.`);

    const now = new Date();
    const startsAt = new Date(now.getTime() - 60 * 60 * 1000);
    const endsAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const retailerIds = new Map<string, string>();
    const storeIds = new Map<string, string>();
    const productIds = new Map<string, string>();
    const dealIds: string[] = [];

    await prisma.$transaction(async (tx) => {
      for (const item of retailers) {
        const id = stableId(`retailer:${item.key}`);
        const categoryId = categoryIds.get(item.category)!;
        retailerIds.set(item.key, id);
        await tx.retailer.upsert({
          where: { id },
          create: { id, displayName: item.name, status: RetailerStatus.ACTIVE, createdByUserId: userId },
          update: { displayName: item.name, status: RetailerStatus.ACTIVE, createdByUserId: userId },
        });
        const membershipId = stableId(`membership:${item.key}:${userId}`);
        await tx.retailerMembership.upsert({
          where: { retailerId_userId: { retailerId: id, userId } },
          create: { id: membershipId, retailerId: id, userId, role: MembershipRole.OWNER, status: MembershipStatus.ACTIVE },
          update: { role: MembershipRole.OWNER, status: MembershipStatus.ACTIVE, revokedAt: null },
        });
        const storeId = stableId(`store:${item.key}`);
        storeIds.set(item.key, storeId);
        await tx.store.upsert({
          where: { id: storeId },
          create: { id: storeId, retailerId: id, categoryId, slug: item.key, name: item.store, description: item.description, addressLine1: item.address, locality: item.locality, city: "Ahmedabad", region: "Gujarat", countryCode: "IN", timezone: "Asia/Kolkata", status: StoreStatus.DRAFT, publishedAt: now },
          update: { retailerId: id, categoryId, slug: item.key, name: item.store, description: item.description, addressLine1: item.address, locality: item.locality, city: "Ahmedabad", region: "Gujarat", countryCode: "IN", timezone: "Asia/Kolkata", status: StoreStatus.DRAFT, publishedAt: now },
        });
        // Development seed marks its clearly labelled fictional premises ready for discovery.
        await tx.$executeRaw`UPDATE "stores" SET "location" = ST_SetSRID(ST_MakePoint(${item.longitude}, ${item.latitude}), 4326)::geography, "verified_at" = ${now}, "verified_by_user_id" = ${userId}::uuid WHERE "id" = ${storeId}::uuid`;
        await tx.store.update({ where: { id: storeId }, data: { status: StoreStatus.ACTIVE, verifiedAt: now, verifiedByUserId: userId } });
      }

      for (const item of products) {
        const id = stableId(`product:${item.key}`);
        const retailerId = retailerIds.get(item.retailer)!;
        const storeId = storeIds.get(item.retailer)!;
        const categoryId = categoryIds.get(item.category)!;
        productIds.set(item.key, id);
        await tx.product.upsert({
          where: { id },
          create: { id, retailerId, storeId, categoryId, createdByUserId: userId, slug: item.key, name: item.name, description: item.description, brand: item.brand, status: ProductStatus.ACTIVE },
          update: { retailerId, storeId, categoryId, createdByUserId: userId, slug: item.key, name: item.name, description: item.description, brand: item.brand, status: ProductStatus.ACTIVE },
        });
      }

      for (const item of deals) {
        const id = stableId(`deal:${item.key}`);
        const storeId = storeIds.get(item.retailer)!;
        const categoryId = categoryIds.get(item.category)!;
        const offerType = item.offerType === "PERCENTAGE" ? OfferType.PERCENTAGE : item.offerType === "FIXED_AMOUNT" ? OfferType.FIXED_AMOUNT : OfferType.BUY_X_GET_Y;
        const prices = item.originalRupees === undefined ? {} : {
          originalPriceMinor: BigInt(item.originalRupees * 100),
          offerPriceMinor: BigInt(item.offerRupees! * 100),
        };
        await tx.deal.upsert({
          where: { id },
          create: {
            id, storeId, categoryId, createdByUserId: userId, slug: item.key, title: item.title, summary: item.summary,
            details: item.details, terms: item.terms, offerType,
            currency: item.offerType === "FIXED_AMOUNT" ? "INR" : null,
            discountBps: item.discountBps ?? null,
            discountAmountMinor: item.discountRupees === undefined ? null : BigInt(item.discountRupees * 100),
            ...prices, imageReference: item.image, startsAt, endsAt, storeTimezone: "Asia/Kolkata", status: DealStatus.PUBLISHED,
            publishedAt: now, perCustomerLimit: 1,
          },
          update: {
            storeId, categoryId, createdByUserId: userId, slug: item.key, title: item.title, summary: item.summary,
            details: item.details, terms: item.terms, offerType,
            currency: item.offerType === "FIXED_AMOUNT" ? "INR" : null,
            discountBps: item.discountBps ?? null,
            discountAmountMinor: item.discountRupees === undefined ? null : BigInt(item.discountRupees * 100),
            originalPriceMinor: "originalPriceMinor" in prices ? prices.originalPriceMinor : null,
            offerPriceMinor: "offerPriceMinor" in prices ? prices.offerPriceMinor : null,
            imageReference: item.image, startsAt, endsAt, storeTimezone: "Asia/Kolkata", status: DealStatus.PUBLISHED, publishedAt: now,
          },
        });
        dealIds.push(id);
        await tx.dealProduct.createMany({
          data: [{ dealId: id, productId: productIds.get(item.product)!, displayOrder: 0 }],
          skipDuplicates: true,
        });
      }
    });

    const counts = await prisma.$transaction([
      prisma.retailer.count({ where: { id: { in: [...retailerIds.values()] } } }),
      prisma.store.count({ where: { id: { in: [...storeIds.values()] } } }),
      prisma.product.count({ where: { id: { in: [...productIds.values()] } } }),
      prisma.deal.count({ where: { id: { in: dealIds }, status: DealStatus.PUBLISHED, startsAt: { lte: now }, endsAt: { gt: now } } }),
      prisma.retailerMembership.count({ where: { retailerId: { in: [...retailerIds.values()] }, userId, status: MembershipStatus.ACTIVE } }),
    ]);
    const [tenantStores, tenantProducts, tenantDeals] = await Promise.all([
      prisma.store.findMany({ where: { id: { in: [...storeIds.values()] } }, select: { id: true, retailerId: true } }),
      prisma.product.findMany({ where: { id: { in: [...productIds.values()] } }, select: { retailerId: true, store: { select: { retailerId: true } } } }),
      prisma.deal.findMany({ where: { id: { in: dealIds } }, select: { store: { select: { retailerId: true } }, products: { select: { product: { select: { retailerId: true } } } } } }),
    ]);
    const demoRetailerIds = new Set(retailerIds.values());
    if (tenantStores.some((store) => !demoRetailerIds.has(store.retailerId))
      || tenantProducts.some((product) => product.store?.retailerId !== product.retailerId)
      || tenantDeals.some((deal) => !demoRetailerIds.has(deal.store.retailerId) || deal.products.some(({ product }) => product.retailerId !== deal.store.retailerId))
      || tenantDeals.length !== deals.length
      || counts[0] !== retailers.length
      || counts[1] !== retailers.length
      || counts[2] !== products.length
      || counts[3] !== deals.length
      || counts[4] !== retailers.length) {
      throw new Error("The seeded records failed count or retailer-ownership verification.");
    }
    console.log(JSON.stringify({ database: "dealse_dev", retailers: counts[0], stores: counts[1], products: counts[2], liveDeals: counts[3], ownerMemberships: counts[4], categoriesUsed: categorySlugs.length }));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown seed error.";
  console.error(`Demo catalogue seed failed: ${message}`);
  process.exitCode = 1;
});

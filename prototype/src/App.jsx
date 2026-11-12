"use client";

import { useEffect, useRef, useState } from "react";
import RetailerImagePicker from "../../apps/web/src/components/RetailerImagePicker.jsx";
import { PublicMediaGallery } from "../../apps/web/src/components/PublicMediaGallery";
import { normalizeOptionalOfferFields, optionalOfferPayload } from "./retailer-offer-form.js";
import {
  ArrowRight, BookOpen, BookmarkSimple, CalendarBlank, CaretDown, Check, Coffee, Compass, Heart, House,
  Leaf, MapPin, MagnifyingGlass, ShoppingBag, Storefront, TShirt, UserCircle,
  X, QrCode, Star, ShareNetwork, SignOut,
} from "@phosphor-icons/react";

const categories = [
  { name: "Fashion & Accessories", short: "Fashion", icon: TShirt, tint: "mint" },
  { name: "Food & Beverages", short: "Food & Drinks", icon: Coffee, tint: "peach" },
  { name: "Home & Living", short: "Home & Living", icon: House, tint: "aqua" },
  { name: "Beauty & Wellness", short: "Beauty & Wellness", icon: Leaf, tint: "lilac" },
  { name: "Electronics", short: "Electronics", icon: ShoppingBag, tint: "sky" },
  { name: "Grocery & Supermarket", short: "Groceries", icon: ShoppingBag, tint: "mint" },
  { name: "Footwear", short: "Footwear", icon: TShirt, tint: "peach" },
  { name: "Gifts & Handicrafts", short: "Gifts & Crafts", icon: Storefront, tint: "peach" },
  { name: "Sports & Fitness", short: "Sports & Fitness", icon: ShoppingBag, tint: "mint" },
  { name: "Books & Stationery", short: "Books & Hobbies", icon: BookOpen, tint: "lilac" },
  { name: "Pets & Pet Care", short: "Pets", icon: Heart, tint: "peach" },
];
const demoDeals = [
  { id: "loom-story", store: "The Loom Story", title: "Selected kurtas and casual wear", category: "Fashion & Accessories", offer: "20% off", description: "Save on selected kurtas and casual wear.", area: "Navrangpura", distance: "2.1 km", valid: "15 Oct 2026", image: "/assets/deal-fashion.png", alt: "Colorful garments in a neighborhood clothing boutique", tint: "coral", rating: "4.7", reviews: "218", terms: "Valid on selected kurtas and casual wear. Show this offer at checkout. Cannot be combined with other offers." },
  { id: "commune-coffee", store: "Commune Coffee Roasters", title: "Buy one, get one on selected beverages", category: "Food & Beverages", offer: "Buy 1 Get 1", description: "Enjoy a second selected beverage on us.", area: "C.G. Road", distance: "3.4 km", valid: "18 Oct 2026", image: "/assets/deal-cafe.png", alt: "Coffee and pastries at an independent neighborhood cafe", tint: "orange", rating: "4.8", reviews: "500", terms: "Valid on selected beverages. Show this offer code to the shopkeeper before placing your order." },
  { id: "bookshop-ahmedabad", store: "The Bookshop Ahmedabad", title: "Selected books and stationery", category: "Books & Stationery", offer: "15% off", description: "Save on selected books and stationery.", area: "Vastrapur", distance: "4.2 km", valid: "18 Oct 2026", image: "/assets/deal-bookstore.png", alt: "Shelves of books inside a local bookstore", tint: "teal", rating: "4.7", reviews: "142", terms: "Valid on books and stationery only. Present this offer at checkout." },
  { id: "plant-people", store: "The Plant People", title: "Indoor plants and planters", category: "Home & Living", offer: "Up to 25% off", description: "Find savings on indoor plants and planters.", area: "Satellite", distance: "4.5 km", valid: "10 Oct 2026", image: "/assets/deal-garden.png", alt: "Green indoor plants at an independent nursery", tint: "green", rating: "4.9", reviews: "96", terms: "Valid on selected indoor plants and planters. Show this offer at the store." },
];

const formatDealDate = (value) => {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(date);
};

const formatDealPrice = (minor) => {
  if (minor === null || minor === undefined || minor === "") return null;
  const amount = Number(minor);
  return Number.isFinite(amount) ? new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount / 100) : null;
};

const formatDealLocation = (area, city) => [...new Set([area, city].map((value) => value?.trim()).filter(Boolean))].join(", ");
const cities = ["Ahmedabad", "Gandhinagar", "Vadodara", "Rajkot"];
const offerStarters = [
  { id: "discount", label: "Discount", detail: "Set a saving on selected items", title: "[Discount] off [selected items]", description: "Choose the saving and list the products or services it covers.", terms: "List eligible items, exclusions, and whether this can be combined with other offers." },
  { id: "bundle", label: "Bundle", detail: "Pair items or services", title: "A bundle with [included items]", description: "Choose which items or services go together and the bundle price or saving.", terms: "List every included item, any substitutions, and the bundle price or saving." },
  { id: "extra", label: "Add-on gift", detail: "Add a little extra to a purchase", title: "Get [gift] with [qualifying purchase]", description: "Choose the qualifying purchase and the extra customers receive.", terms: "Name the gift, qualifying purchase, and any availability limits or exclusions." },
  { id: "quiet-time", label: "Quiet-time offer", detail: "Choose your own days and hours", title: "[Offer] during [day or time]", description: "Set the days and hours, then say what customers receive.", terms: "State the exact days and hours, eligible items, and how customers use the offer." },
];

function suggestedOfferImage(category, content = "") {
  const text = `${category} ${content}`.toLowerCase();
  if (/food|beverage|cafe|coffee|bakery|restaurant|snack|meal|drink|grocery|kirana/.test(text)) {
    return { src: "/assets/deal-cafe.png", alt: "Illustrative local food and drink offer image", label: "Food & drink" };
  }
  if (/fashion|cloth|textile|garment|apparel|saree|kurta|dupatta|boutique|accessor/.test(text)) {
    return { src: "/assets/deal-fashion.png", alt: "Illustrative local fashion offer image", label: "Fashion" };
  }
  if (/book|stationery|hobby|journal|novel/.test(text)) {
    return { src: "/assets/deal-bookstore.png", alt: "Illustrative local books and stationery offer image", label: "Books & stationery" };
  }
  if (/plant|garden|home|living|furniture|decor|interior/.test(text)) {
    return { src: "/assets/deal-garden.png", alt: "Illustrative home and living offer image", label: "Home & living" };
  }
  if (/fashion|cloth|textile|apparel/.test(category.toLowerCase())) {
    return { src: "/assets/deal-fashion.png", alt: "Illustrative local fashion offer image", label: "Fashion" };
  }
  return { src: "/assets/hero-shopkeeper.png", alt: "Illustrative local shop offer image", label: "Local store" };
}

function DealCard({ deal, saved, onSave, onOpen }) {
  const originalPrice = formatDealPrice(deal.originalPriceMinor);
  const offerPrice = formatDealPrice(deal.offerPriceMinor);
  return <article className="deal-card">
    <button className="deal-card__image-button" type="button" aria-label={`Open ${deal.title || deal.store} offer`} onClick={() => onOpen(deal)}><img src={deal.image} alt={deal.alt} loading="lazy" onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = deal.fallbackImage || "/assets/hero-shopkeeper.png"; }} /><span className={`offer-tag offer-tag--${deal.tint}`}>{deal.offer}</span></button>
    <button className={`save-button ${saved ? "is-saved" : ""}`} type="button" aria-label={saved ? `Remove ${deal.title || deal.store} from saved deals` : `Save ${deal.title || deal.store}`} aria-pressed={saved} onClick={() => onSave(deal.id)}><Heart size={18} weight={saved ? "fill" : "regular"} /></button>
    <button className="deal-card__body" type="button" onClick={() => onOpen(deal)}><strong>{deal.title || deal.store}</strong><span className="deal-card__store">{deal.store}</span>{(originalPrice || offerPrice) && <span className="deal-card__pricing">{originalPrice && <del>{originalPrice}</del>}{offerPrice && <b>{offerPrice}</b>}</span>}<small><MapPin size={13} weight="fill" /> {deal.area}<i>{deal.distance}</i></small><small><CalendarBlank size={13} /> Valid till {deal.valid}</small></button>
  </article>;
}

function discountPercent(deal) {
  if (Number(deal.discountBps) > 0) return Number(deal.discountBps) / 100;
  const discount = Number(deal.discountAmountMinor || 0);
  const original = Number(deal.originalPriceMinor || 0);
  if (discount > 0 && original > 0) return Math.round(discount / original * 100);
  return 0;
}

function diverseDeals(items, limit, keyFor, compare) {
  const ranked = [...items].sort(compare);
  const selected = [];
  const seen = new Set();
  for (const deal of ranked) {
    const key = keyFor(deal);
    if (seen.has(key)) continue;
    seen.add(key);
    selected.push(deal);
    if (selected.length === limit) return selected;
  }
  for (const deal of ranked) {
    if (!selected.includes(deal)) selected.push(deal);
    if (selected.length === limit) break;
  }
  return selected;
}

function Dialog({ title, close, children, className = "", dialogRef, closeRef }) {
  return <div className="dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}><section ref={dialogRef} className={`dialog ${className}`} role="dialog" aria-modal="true" aria-labelledby="dialog-title" tabIndex={-1}><button ref={closeRef} className="dialog-close" type="button" aria-label="Close dialog" onClick={close}><X size={20} /></button><h2 id="dialog-title">{title}</h2>{children}</section></div>;
}

function makePreviewCode() {
  const bytes = new Uint8Array(4);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else bytes.forEach((_, index) => { bytes[index] = Math.floor(Math.random() * 256); });
  const token = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
  return `DS-${token.slice(0, 4)}-${token.slice(4)}`;
}

function RetailerPage({ onGetStarted, onLogin }) {
  const benefits = [
    { icon: MapPin, title: "Reach nearby customers", text: "Help customers discover your store through local offers, categories, and location-based browsing." },
    { icon: CalendarBlank, title: "Run offers on your schedule", text: "Create offers around quieter hours, seasonal moments, or the products you want to highlight." },
    { icon: QrCode, title: "Redeem in store", text: "Customers present their offer code. The retailer checks the offer and confirms redemption at checkout." },
    { icon: ShoppingBag, title: "Manage your shop profile", text: "Keep your store information and the products you choose to feature in one place." },
    { icon: ArrowRight, title: "See what customers respond to", text: "Review offer activity and redemption history where those events are available." },
    { icon: Heart, title: "Manage your offers", text: "Review current offers and update, pause, or adjust them as your store’s plans change." },
  ];
  return <main className="retailer-page">
    <section className="retailer-hero"><div className="retailer-container retailer-hero-grid"><div className="retailer-hero-copy"><p className="retailer-eyebrow"><span /> FOR LOCAL BUSINESSES</p><h1>Your shop.<br />Your rules.<br /><em>Their next stop.</em></h1><p className="retailer-lede">Put your store in front of nearby customers with offers you control, and welcome them through your door.</p><div className="retailer-hero-actions"><button className="retailer-button retailer-button-primary" type="button" onClick={onGetStarted}>Get started <ArrowRight size={17} /></button><button className="retailer-button retailer-button-quiet" type="button" onClick={onLogin}>Retailer sign in</button><button className="retailer-button retailer-button-quiet" type="button" onClick={() => document.querySelector("#retailer-how")?.scrollIntoView({ behavior: "smooth" })}>See how it works</button></div><p className="retailer-note">For independent stores, services, and neighbourhood businesses.</p></div><div className="retailer-visual"><img src="/assets/hero-shopkeeper.png" alt="A local shopkeeper welcoming a customer" /><div className="retailer-visual-card"><span className="retailer-mark"><Storefront size={20} /></span><div><small>YOUR STORE ON DEALSE</small><strong>Local discovery starts here.</strong></div><span className="retailer-visual-dot" /></div><div className="retailer-visual-sticker">Made for<br /><b>local business</b></div></div></div></section>
    <section className="retailer-how" id="retailer-how"><div className="retailer-container"><div className="retailer-section-heading"><p className="retailer-eyebrow">A simple way to get started</p><h2>From your shop to their screen</h2><p>Keep the process clear: set up your business, create an offer, and welcome customers in store.</p></div><div className="retailer-steps"><article><span>01</span><div><h3>Set up your store</h3><p>Add your business name, category, location, and the details customers need to find you.</p></div></article><article><span>02</span><div><h3>Create an offer</h3><p>Choose what to feature, set the terms and dates, then review how the offer will appear.</p></div></article><article><span>03</span><div><h3>Welcome customers</h3><p>Customers discover an offer, visit your store, and present its code at checkout. Confirming here is a session-only preview.</p></div></article></div></div></section>
    <section className="retailer-benefits"><div className="retailer-container"><div className="retailer-section-heading"><p className="retailer-eyebrow">Made for the way local stores work</p><h2>Useful tools. Your decisions.</h2><p>DealSe helps you manage the offer and store information customers see.</p></div><div className="retailer-benefit-grid">{benefits.map(({ icon: Icon, title, text }) => <article className="retailer-benefit" key={title}><span className="retailer-benefit-icon"><Icon size={22} /></span><h3>{title}</h3><p>{text}</p></article>)}</div></div></section>
    <section className="retailer-control"><div className="retailer-container retailer-control-grid"><div className="retailer-control-image"><img src="/assets/hero-textiles.png" alt="A customer browsing a neighbourhood clothing store" /><span className="retailer-image-caption">Your store stays yours.</span></div><div className="retailer-control-copy"><p className="retailer-eyebrow">Built around retailer control</p><h2>You know your customers. You choose the offer.</h2><p>Choose how to present your products, write clear terms, and decide when an offer is active. Use limited-time deals or highlight what is special in your store today.</p><ul><li><Check size={17} /> Set offer details and terms</li><li><Check size={17} /> Choose dates that suit your business</li><li><Check size={17} /> Review offer activity when available</li></ul><button className="retailer-button retailer-button-primary" type="button" onClick={onGetStarted}>Create your store profile <ArrowRight size={17} /></button></div></div></section>
    <section className="retailer-final-cta"><div className="retailer-container"><div><p className="retailer-eyebrow">GROW WITH YOUR NEIGHBOURHOOD</p><h2>Bring your local business into the conversation.</h2><p>Start with your store details. Add an offer when you’re ready.</p></div><button className="retailer-button retailer-button-light" type="button" onClick={onGetStarted}>Get started with DealSe <ArrowRight size={17} /></button></div></section>
  </main>;
}

function RetailerWorkspace(props) {
  if (props.onCreateDeal) return <RetailerMarketplaceWorkspace {...props} />;
  return <RetailerWorkspacePreview {...props} />;
}

function RetailerMediaPicker(props) { return <RetailerImagePicker {...props} />; }

function RetailerMarketplaceWorkspace({ store, retailerSession, initialStores = [], initialProducts = [], initialRetailerDeals = [], initialCategories = [], notificationCount = 0, onCreateStore, onUpdateStore, onCreateProduct, onUpdateProduct, onArchiveProduct, onCreateDeal, onUpdateDeal, onPublishDeal, onPauseDeal, onPreviewDeal, onSignOut }) {
  const [section, setSection] = useState(store?.hasStore ? "overview" : "store");
  const [stores, setStores] = useState(initialStores);
  const [products, setProducts] = useState(initialProducts);
  const [offers, setOffers] = useState(initialRetailerDeals);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [editingProduct, setEditingProduct] = useState(null);
  const [productSearch, setProductSearch] = useState("");
  const [editingDeal, setEditingDeal] = useState(null);
  const [dealImage, setDealImage] = useState("");
  const [dealImages, setDealImages] = useState([]);
  const [dealPreview, setDealPreview] = useState(null);
  const [dealStep, setDealStep] = useState(1);
  const [selectedStoreId, setSelectedStoreId] = useState(store?.id || initialStores[0]?.id || "");
  const [editingStoreId, setEditingStoreId] = useState(store?.id || initialStores[0]?.id || null);
  const [productForm, setProductForm] = useState({ name: "", slug: "", description: "", brand: "", categoryId: initialCategories[0]?.id || "", storeId: store?.id || "" });
  const todayInIndia = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const defaultExpiryInIndia = new Date(Date.now() + 7 * 86_400_000 + 330 * 60_000).toISOString().slice(0, 10);
  const blankDeal = { title: "", summary: "", details: "", terms: "", storeId: store?.id || initialStores[0]?.id || "", categoryId: store?.categoryId || initialCategories[0]?.id || "", offerType: "PERCENTAGE", discount: "20", discountAmount: "", originalPrice: "", offerPrice: "", startsAt: todayInIndia, endsAt: defaultExpiryInIndia, imageReference: "", productIds: [] };
  const [dealForm, setDealForm] = useState(blankDeal);
  const [storeForm, setStoreForm] = useState({ name: store?.storeName || "", slug: store?.storeName?.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "", description: store?.description || "", categoryId: store?.categoryId || initialCategories[0]?.id || "", addressLine1: store?.address || "", locality: store?.area || "", city: store?.city || "Ahmedabad", region: "Gujarat", countryCode: "IN", timezone: "Asia/Kolkata" });
  const retailerId = store?.retailerId;
  const currentStore = stores.find((item) => item.id === selectedStoreId) || stores[0];
  const firstName = store?.ownerName?.split(" ")[0] || retailerSession?.ownerName?.split(" ")[0] || "there";
  const categoryName = (id) => initialCategories.find((item) => item.id === id)?.name || "Local business";
  const filteredProducts = products.filter((product) => `${product.name} ${product.brand || ""} ${product.category?.name || ""}`.toLowerCase().includes(productSearch.trim().toLowerCase()));

  const run = async (operation, successMessage) => {
    setBusy(true); setError(""); setMessage("");
    try { await operation(); setMessage(successMessage); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "The request failed. Please try again."); }
    finally { setBusy(false); }
  };
  const saveStore = (event) => {
    event.preventDefault();
    run(async () => {
      if (editingStoreId) await onUpdateStore(retailerId, editingStoreId, storeForm);
      else await onCreateStore(retailerId, storeForm);
      window.location.reload();
    }, "Store profile saved.");
  };
  const selectStoreForEdit = (storeId) => {
    setSelectedStoreId(storeId);
    const selected = stores.find((item) => item.id === storeId);
    if (!selected) return;
    setEditingStoreId(storeId);
    setStoreForm({ name: selected.name, slug: selected.slug, description: selected.description || "", categoryId: selected.categoryId || initialCategories[0]?.id || "", addressLine1: selected.addressLine1 || "", locality: selected.locality || "", city: selected.city, region: selected.region, countryCode: "IN", timezone: selected.timezone || "Asia/Kolkata" });
  };
  const startNewStore = () => {
    setEditingStoreId(null);
    setStoreForm({ name: "", slug: "", description: "", categoryId: initialCategories[0]?.id || "", addressLine1: "", locality: "", city: "Ahmedabad", region: "Gujarat", countryCode: "IN", timezone: "Asia/Kolkata" });
    setSection("store");
  };
  const saveProduct = (event) => {
    event.preventDefault();
    const input = { ...productForm, slug: productForm.slug || productForm.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") };
    run(async () => {
      let savedProduct;
      if (editingProduct) {
        savedProduct = await onUpdateProduct(retailerId, editingProduct.id, input);
        setProducts((previous) => previous.map((item) => item.id === savedProduct.id ? savedProduct : item));
      } else {
        savedProduct = await onCreateProduct(retailerId, input);
        setProducts((previous) => [savedProduct, ...previous]);
      }
      setEditingProduct(savedProduct);
      setProductForm({ name: savedProduct.name, slug: savedProduct.slug, description: savedProduct.description || "", brand: savedProduct.brand || "", categoryId: savedProduct.categoryId, storeId: savedProduct.storeId || "" });
    }, editingProduct ? "Product updated." : "Product added.");
  };
  const startProductEdit = (product) => { setEditingProduct(product); setProductForm({ name: product.name, slug: product.slug, description: product.description || "", brand: product.brand || "", categoryId: product.categoryId, storeId: product.storeId || "" }); };
  const removeProduct = (product) => run(async () => { await onArchiveProduct(retailerId, product.id); setProducts((previous) => previous.filter((item) => item.id !== product.id)); }, "Product archived.");
  const formDate = (date, end = false) => `${date}T${end ? "23:59:59" : "00:00:00"}+05:30`;
  const dealInput = () => ({
    title: dealForm.title.trim(), ...optionalOfferPayload(dealForm, { editing: Boolean(editingDeal) }),
    terms: dealForm.terms.trim(), storeId: dealForm.storeId, categoryId: dealForm.categoryId,
    offerType: dealForm.offerType,
    ...(dealForm.offerType === "PERCENTAGE" ? { discountBps: Math.round(Number(dealForm.discount) * 100) } : {}),
    ...(dealForm.offerType === "FIXED_AMOUNT" ? { discountAmountMinor: Math.round(Number(dealForm.discountAmount) * 100), currency: "INR" } : {}),
    ...(dealForm.originalPrice && dealForm.offerPrice ? { originalPriceMinor: Math.round(Number(dealForm.originalPrice) * 100), offerPriceMinor: Math.round(Number(dealForm.offerPrice) * 100) } : {}),
    startsAt: formDate(dealForm.startsAt), endsAt: formDate(dealForm.endsAt, true),
    productIds: dealForm.productIds,
  });
  const saveDeal = (event) => {
    event?.preventDefault();
    const hasOriginalPrice = Boolean(dealForm.originalPrice);
    const hasOfferPrice = Boolean(dealForm.offerPrice);
    if (hasOriginalPrice !== hasOfferPrice) { setError("Enter both prices, or leave both blank."); return; }
    if (hasOriginalPrice && Number(dealForm.offerPrice) >= Number(dealForm.originalPrice)) { setError("Offer price must be lower than original price."); return; }
    run(async () => {
      await persistDeal(dealInput());
    }, editingDeal ? "Draft updated." : "Draft saved.");
  };
  const persistDeal = async (input) => {
      const result = editingDeal ? await onUpdateDeal(retailerId, editingDeal.id, input) : await onCreateDeal(retailerId, input);
      const normalized = { ...result, imageReference: result.imageReference ?? input.imageReference, offer: result.offer || `${(result.discountBps || 0) / 100}% off`, description: result.summary || result.description || result.title, startDate: result.startsAt.slice(0, 10), endDate: result.endsAt.slice(0, 10), image: result.image || suggestedOfferImage(categoryName(result.categoryId), result.title).src, category: result.category?.name || categoryName(result.categoryId), storeName: result.store?.name || currentStore?.name || store?.storeName, status: result.status };
      setOffers((previous) => editingDeal ? previous.map((item) => item.id === result.id ? normalized : item) : [normalized, ...previous]);
      setDealImage(normalized.image?.startsWith("/media/") ? normalized.image : "");
      setDealImages(normalized.images || []);
      setEditingDeal(normalized); setDealForm((previous) => ({ ...previous, ...normalized, ...normalizeOptionalOfferFields(normalized), offerType: String(normalized.offerType || "PERCENTAGE").toUpperCase(), startsAt: normalized.startDate, endsAt: normalized.endDate, storeId: normalized.storeId || currentStore?.id, categoryId: normalized.categoryId || "", discount: String((normalized.discountBps || 2000) / 100), originalPrice: normalized.originalPriceMinor ? String(Number(normalized.originalPriceMinor) / 100) : "", offerPrice: normalized.offerPriceMinor ? String(Number(normalized.offerPriceMinor) / 100) : "" }));
      return result;
  };
  const saveDealDraft = () => {
    const fallbackTerms = dealForm.terms.trim() || "Please confirm eligible items and offer conditions with the store.";
    if (!dealForm.title.trim() || !dealForm.storeId || !dealForm.categoryId) {
      setError("Add an offer title, store, and category before saving your draft.");
      setDealStep(1);
      return;
    }
    const hasOriginalPrice = Boolean(dealForm.originalPrice);
    const hasOfferPrice = Boolean(dealForm.offerPrice);
    if (hasOriginalPrice !== hasOfferPrice || (hasOriginalPrice && Number(dealForm.offerPrice) >= Number(dealForm.originalPrice))) {
      setError("Enter both prices and make the offer price lower, or leave both prices blank.");
      setDealStep(2);
      return;
    }
    if (dealForm.offerType === "FIXED_AMOUNT" && (!Number(dealForm.discountAmount) || Number(dealForm.discountAmount) <= 0)) {
      setError("Enter the fixed discount amount before saving this draft.");
      setDealStep(2);
      return;
    }
    run(() => persistDeal({ ...dealInput(), terms: fallbackTerms }), editingDeal ? "Draft updated." : "Draft saved.");
  };
  const publishWizard = () => {
    if (!dealForm.title.trim() || !dealForm.storeId || !dealForm.categoryId) { setError("Add an offer title, store, and category first."); setDealStep(1); return; }
    if (!dealForm.terms.trim() || dealForm.terms.trim() === "Please confirm eligible items and offer conditions with the store.") { setError("Add your own terms before publishing this offer."); setDealStep(3); return; }
    if (dealForm.endsAt < dealForm.startsAt) { setError("Expiry date must be after the start date."); setDealStep(3); return; }
    run(async () => {
      const saved = await persistDeal(dealInput());
      const result = await onPublishDeal(retailerId, saved.id);
      const published = { ...saved, status: result.status };
      setOffers((previous) => previous.map((item) => item.id === saved.id ? { ...item, status: result.status } : item));
      setEditingDeal(published);
    }, "Offer published and available for customer discovery.");
  };
  const goToDealStep = (step) => {
    if (step > dealStep) {
      if (dealStep === 1 && (!dealForm.title.trim() || !dealForm.storeId || !dealForm.categoryId)) { setError("Add an offer title, store, and category to continue."); return; }
      if (dealStep === 2) {
        const original = Number(dealForm.originalPrice);
        const offer = Number(dealForm.offerPrice);
        if (dealForm.offerType === "PERCENTAGE" && (!Number(dealForm.discount) || Number(dealForm.discount) < 1 || Number(dealForm.discount) > 100)) { setError("Choose a percentage from 1% to 100%."); return; }
        if (dealForm.offerType === "FIXED_AMOUNT" && (!Number(dealForm.discountAmount) || Number(dealForm.discountAmount) <= 0)) { setError("Enter a discount amount above zero."); return; }
        if ((dealForm.originalPrice && !dealForm.offerPrice) || (!dealForm.originalPrice && dealForm.offerPrice) || (dealForm.originalPrice && (!Number.isFinite(original) || !Number.isFinite(offer) || offer <= 0 || offer >= original))) { setError("Enter a valid offer price below the original price, or leave both prices blank."); return; }
      }
      if (dealStep === 3 && dealForm.endsAt < dealForm.startsAt) { setError("Expiry date must be after the start date."); return; }
    }
    setError("");
    setDealStep(step);
  };
  const updateDealPricing = (field, value) => {
    setDealForm((previous) => {
      const next = { ...previous, [field]: value };
      const original = Number(field === "originalPrice" ? value : next.originalPrice);
      if (original > 0 && (next.offerType === "PERCENTAGE" || next.offerType === "FIXED_AMOUNT")) {
        const discount = next.offerType === "PERCENTAGE" ? Number(next.discount) / 100 : Number(next.discountAmount);
        if (discount > 0) next.offerPrice = (Math.max(0, original - (next.offerType === "PERCENTAGE" ? original * discount : discount))).toFixed(2).replace(/\.00$/, "");
      }
      return next;
    });
  };
  const editDeal = (deal) => {
    setEditingDeal(deal);
    setDealImage(deal.image?.startsWith("/media/") ? deal.image : "");
    setDealImages(deal.images || []);
    setDealStep(1);
    setDealForm({ ...blankDeal, ...deal, ...normalizeOptionalOfferFields(deal), offerType: String(deal.offerType || "PERCENTAGE").toUpperCase(), storeId: deal.store?.id || deal.storeId || currentStore?.id, categoryId: deal.categoryId || "", startsAt: deal.startsAt?.slice(0, 10) || deal.startDate, endsAt: deal.endsAt?.slice(0, 10) || deal.endDate, discount: String((deal.discountBps || 2000) / 100), originalPrice: deal.originalPriceMinor ? String(Number(deal.originalPriceMinor) / 100) : "", offerPrice: deal.offerPriceMinor ? String(Number(deal.offerPriceMinor) / 100) : "", productIds: deal.products?.map((product) => product.id) || [] });
    setSection("offers");
  };
  const publish = (deal) => run(async () => { const result = await onPublishDeal(retailerId, deal.id); setOffers((previous) => previous.map((item) => item.id === deal.id ? { ...item, status: result.status } : item)); setEditingDeal((previous) => previous?.id === deal.id ? { ...previous, status: result.status } : previous); }, "Offer published.");
  const pause = (deal) => run(async () => { await onPauseDeal(retailerId, deal.id); setOffers((previous) => previous.map((item) => item.id === deal.id ? { ...item, status: "paused" } : item)); }, "Offer paused.");
  const preview = (deal) => run(async () => { const result = await onPreviewDeal(retailerId, deal.id); setDealPreview(result); }, "Offer preview ready.");

  if (!store?.hasStore) return <main className="retailer-workspace retailer-workspace--setup"><section className="workspace-main"><div className="workspace-content"><div className="workspace-welcome"><div><p className="retailer-eyebrow"><span /> STORE SETUP</p><h1>Complete your store profile</h1><p>Add the details customers need to find your business.</p></div></div><form className="workspace-panel workspace-form-panel" onSubmit={saveStore}><div className="workspace-form-grid">
    <WorkspaceField label="Store name" required><input required minLength={2} maxLength={180} value={storeForm.name} onChange={(event) => setStoreForm({ ...storeForm, name: event.target.value, slug: event.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") })} /></WorkspaceField>
    <WorkspaceField label="Category" required><select required value={storeForm.categoryId} onChange={(event) => setStoreForm({ ...storeForm, categoryId: event.target.value })}>{initialCategories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></WorkspaceField>
    <WorkspaceField label="Street address"><input value={storeForm.addressLine1} onChange={(event) => setStoreForm({ ...storeForm, addressLine1: event.target.value })} /></WorkspaceField>
    <WorkspaceField label="Area / locality"><input value={storeForm.locality} onChange={(event) => setStoreForm({ ...storeForm, locality: event.target.value })} /></WorkspaceField>
    <WorkspaceField label="City" required><input required value={storeForm.city} onChange={(event) => setStoreForm({ ...storeForm, city: event.target.value })} /></WorkspaceField>
    <WorkspaceField label="State / region" required><input required value={storeForm.region} onChange={(event) => setStoreForm({ ...storeForm, region: event.target.value })} /></WorkspaceField>
    <WorkspaceField label="Description" wide><textarea rows={4} value={storeForm.description} onChange={(event) => setStoreForm({ ...storeForm, description: event.target.value })} /></WorkspaceField>
    </div>{error && <p className="flow-error" role="alert">{error}</p>}{message && <p className="offer-idea-status" role="status">{message}</p>}<div className="workspace-form-actions"><button className="retailer-button retailer-button-primary" disabled={busy || !initialCategories.length}>{busy ? "Saving…" : "Save store profile"} <Check size={16} /></button></div></form></div></section></main>;

  const navTo = (key) => { setSection(key); setError(""); setMessage(""); };
  const startNewDeal = () => { if (section === "offers" && !editingDeal) { setDealStep(1); return; } setEditingDeal(null); setDealImage(""); setDealImages([]); setDealForm({ ...blankDeal, storeId: currentStore?.id || "" }); setDealStep(1); setDealPreview(null); setError(""); navTo("offers"); };
  return <main className="retailer-workspace"><aside className="workspace-sidebar"><a className="workspace-brand" href="#workspace" onClick={(event) => event.preventDefault()}><img src="/assets/dealse-logo.png" alt="" /><span><strong>DealSe</strong><small>Retailer workspace</small></span></a><div className="workspace-store-chip"><span className="workspace-store-icon"><Storefront size={19} /></span><span><strong>{currentStore?.name || store.storeName}</strong><small>{currentStore?.locality || currentStore?.city || store.area}</small></span></div><nav aria-label="Retailer workspace">{[["overview", "Overview"], ["offers", "Offers"], ["products", "Products"], ["store", "Store profile"], ["account", "Account"]].map(([key, label]) => <button key={key} type="button" className={section === key ? "active" : ""} onClick={() => navTo(key)}><span className="workspace-nav-icon">{key === "offers" ? "◇" : key === "products" ? "▦" : key === "store" ? "▣" : key === "account" ? "◉" : "⌂"}</span>{label}{key === "offers" && <span className="workspace-nav-count">{offers.length}</span>}</button>)}</nav><div className="workspace-sidebar-bottom"><span className="workspace-preview-note"><i /> Connected to DealSe</span><button type="button" onClick={() => onSignOut?.()}>Log out <ArrowRight size={15} /></button></div></aside>
    <section className="workspace-main"><header className="workspace-topbar"><div><span className="workspace-mobile-brand"><img src="/assets/dealse-logo.png" alt="" />DealSe</span><p>Retailer workspace <span>/</span> {section === "overview" ? "Overview" : section === "offers" ? "Offers" : section === "products" ? "Products" : section === "account" ? "Account" : "Store profile"}</p></div><a className="workspace-notification-link" href="/retailer/notifications">Notifications{notificationCount > 0 && <span>{notificationCount}</span>}</a><span className="workspace-top-status">CONNECTED</span></header><div className="workspace-content">
      <div className="workspace-welcome"><div><p className="retailer-eyebrow"><span /> YOUR STORE WORKSPACE</p><h1>{section === "overview" ? `Welcome, ${firstName}.` : section === "offers" ? "Manage offers" : section === "products" ? "Manage products" : section === "account" ? "Your account" : "Store profile"}</h1><p>{section === "overview" ? "Create and publish offers customers can discover on DealSe." : section === "offers" ? "Prepare a deal, preview it, then publish it to the customer marketplace." : section === "products" ? "Add products that your offers can feature." : section === "account" ? "Your retailer identity and workspace access." : "Keep your public store information up to date."}</p></div>{section === "offers" && <button type="button" className="retailer-button retailer-button-primary" onClick={startNewDeal}>Create offer <ArrowRight size={15} /></button>}{section === "products" && editingProduct && <button type="button" className="retailer-button retailer-button-primary" onClick={() => { setEditingProduct(null); setProductForm({ ...productForm, name: "", slug: "", description: "", brand: "" }); }}>New product <ArrowRight size={15} /></button>}</div>
      {error && <p className="flow-error" role="alert">{error}</p>}{message && <p className="offer-idea-status" role="status">{message}</p>}
      {section === "overview" && <><div className="workspace-stat-grid"><article><span className="workspace-stat-icon"><CalendarBlank size={19} /></span><small>Total offers</small><strong>{offers.length}</strong><em>Saved to PostgreSQL</em></article><article><span className="workspace-stat-icon"><Storefront size={19} /></span><small>Products</small><strong>{products.length}</strong><em>In your catalogue</em></article><article><span className="workspace-stat-icon"><Check size={19} /></span><small>Published</small><strong>{offers.filter((item) => item.status === "published").length}</strong><em>Visible while valid</em></article></div><section className="workspace-panel workspace-offer-panel"><div className="workspace-panel-heading"><div><h2>Your latest offers</h2><p>Drafts and published offers persist in your DealSe account.</p></div><button type="button" onClick={() => setSection("offers")}>Manage offers <ArrowRight size={14} /></button></div>{offers.length ? <div className="workspace-offer-list">{offers.slice(0, 4).map((deal) => <article className="workspace-offer-row" key={deal.id}><img className="workspace-offer-thumb" src={deal.image} alt="" /><div><strong>{deal.title}</strong><p>{deal.description}</p><small>{deal.startDate} – {deal.endDate}</small></div><span className="workspace-draft-status">{deal.status}</span><button type="button" onClick={() => editDeal(deal)}>Edit</button></article>)}</div> : <div className="workspace-empty"><span><CalendarBlank size={22} /></span><h3>Start with your first offer</h3><p>Add a deal to make it available for customers to discover.</p><button type="button" className="retailer-button retailer-button-primary" onClick={() => setSection("offers")}>Create an offer <ArrowRight size={15} /></button></div>}</section></>}
      {section === "account" && <section className="workspace-panel workspace-profile-card"><span className="workspace-profile-avatar"><UserCircle size={28} /></span><div className="workspace-profile-main"><p className="retailer-eyebrow">RETAILER ACCOUNT</p><h2>{store.ownerName || firstName}</h2><p>{store.email || "Email not available"}</p><div className="workspace-profile-details"><div><small>Retailer</small><strong>{store.storeName || currentStore?.name}</strong></div><div><small>Current store</small><strong>{currentStore?.name || "No store selected"}</strong></div><div><small>Location</small><strong>{[currentStore?.locality, currentStore?.city].filter(Boolean).join(", ") || "Add a store location"}</strong></div></div><button className="workspace-secondary-button workspace-account-signout" type="button" onClick={() => onSignOut?.()}>Sign out</button></div></section>}
      {section === "store" && <>
        {stores.length > 0 && <section className="workspace-panel workspace-store-picker"><WorkspaceField label="Your stores"><select value={editingStoreId || "new"} onChange={(event) => event.target.value === "new" ? startNewStore() : selectStoreForEdit(event.target.value)}>{stores.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.city}</option>)}<option value="new">Add another store…</option></select></WorkspaceField><p>{stores.length} store{stores.length === 1 ? "" : "s"} connected to this retailer profile.</p></section>}
        <form className="workspace-panel workspace-form-panel workspace-store-form" onSubmit={saveStore}>
          <div className="workspace-form-titlebar"><div><span className="workspace-form-step">STORE PROFILE</span><h2>{editingStoreId ? "Store information" : "Add a store"}</h2><p>Keep your public business details accurate and easy for local customers to find.</p></div><span className="workspace-store-logo-placeholder">{editingStoreId && currentStore?.image ? <img src={currentStore.image} alt={currentStore.imageAlt || currentStore.name} /> : <Storefront size={25} />}<small>Store profile</small></span></div>
          <section className="workspace-form-section"><div className="workspace-form-section-heading"><span>01</span><div><h3>Business details</h3><p>Your store name and category appear on customer offer cards.</p></div></div><div className="workspace-form-grid"><WorkspaceField label="Store name" required><input required minLength={2} maxLength={180} placeholder="Your store name" value={storeForm.name} onChange={(event) => setStoreForm({ ...storeForm, name: event.target.value, slug: event.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") })} /></WorkspaceField><WorkspaceField label="Category" required><select required value={storeForm.categoryId} onChange={(event) => setStoreForm({ ...storeForm, categoryId: event.target.value })}>{initialCategories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></WorkspaceField></div><RetailerMediaPicker label="Store logo and cover images" purpose="STORE" retailerId={retailerId} targetId={editingStoreId} images={editingStoreId ? currentStore?.images || [] : []} presets={[{ label: "Square store logo · 1:1", ratio: 1 }, { label: "Wide store cover · 16:9", ratio: 16 / 9 }]} altText={storeForm.name} onChange={(images) => setStores((previous) => previous.map((item) => { if (item.id !== editingStoreId) return item; const primary = images.find(({ isPrimary }) => isPrimary); return { ...item, images, image: primary?.url || null, imageAlt: primary?.altText || item.name }; }))} /></section>
          <section className="workspace-form-section"><div className="workspace-form-section-heading"><span>02</span><div><h3>Store location</h3><p>Help customers understand where to visit.</p></div></div><div className="workspace-form-grid"><WorkspaceField label="Street address"><input maxLength={255} placeholder="Building, street, or road" value={storeForm.addressLine1} onChange={(event) => setStoreForm({ ...storeForm, addressLine1: event.target.value })} /></WorkspaceField><WorkspaceField label="Area or locality"><input maxLength={120} placeholder="Neighbourhood" value={storeForm.locality} onChange={(event) => setStoreForm({ ...storeForm, locality: event.target.value })} /></WorkspaceField><WorkspaceField label="City" required><input required maxLength={100} value={storeForm.city} onChange={(event) => setStoreForm({ ...storeForm, city: event.target.value })} /></WorkspaceField><WorkspaceField label="State or region" required><input required maxLength={100} value={storeForm.region} onChange={(event) => setStoreForm({ ...storeForm, region: event.target.value })} /></WorkspaceField></div></section>
          <section className="workspace-form-section"><div className="workspace-form-section-heading"><span>03</span><div><h3>About your store</h3><p>Share a short introduction customers can read before visiting.</p></div></div><div className="workspace-form-grid"><WorkspaceField label="Store description" wide><textarea rows={4} maxLength={2000} placeholder="What makes your store useful to customers nearby?" value={storeForm.description} onChange={(event) => setStoreForm({ ...storeForm, description: event.target.value })} /></WorkspaceField></div></section>
          <div className="workspace-form-actions"><span className="workspace-form-actions-spacer" /><button className="retailer-button retailer-button-primary" disabled={busy || !initialCategories.length}>{busy ? "Saving…" : editingStoreId ? "Save store changes" : "Create store profile"} <Check size={16} /></button></div>
        </form>
      </>}
      {section === "products" && <>
        <form className="workspace-panel workspace-form-panel workspace-product-form" onSubmit={saveProduct}>
          <div className="workspace-form-titlebar"><div><span className="workspace-form-step">PRODUCT CATALOGUE</span><h2>{editingProduct ? "Edit product" : "Add a product"}</h2><p>Keep a simple catalogue that you can attach to customer offers.</p></div></div>
          <section className="workspace-form-section"><div className="workspace-form-section-heading"><span>01</span><div><h3>Product information</h3><p>Use a recognizable name and assign the product to a category.</p></div></div><div className="workspace-form-grid"><WorkspaceField label="Product name" required><input required minLength={2} maxLength={180} placeholder="Product or service name" value={productForm.name} onChange={(event) => setProductForm({ ...productForm, name: event.target.value, slug: event.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") })} /></WorkspaceField><WorkspaceField label="Category" required><select required value={productForm.categoryId} onChange={(event) => setProductForm({ ...productForm, categoryId: event.target.value })}>{initialCategories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></WorkspaceField><WorkspaceField label="Brand"><input maxLength={120} placeholder="Optional brand name" value={productForm.brand} onChange={(event) => setProductForm({ ...productForm, brand: event.target.value })} /></WorkspaceField><WorkspaceField label="Store"><select value={productForm.storeId} onChange={(event) => setProductForm({ ...productForm, storeId: event.target.value })}>{stores.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></WorkspaceField><WorkspaceField label="Description" wide><textarea rows={3} maxLength={2000} placeholder="A brief product description" value={productForm.description} onChange={(event) => setProductForm({ ...productForm, description: event.target.value })} /></WorkspaceField></div><RetailerMediaPicker label="Product photos" purpose="PRODUCT" retailerId={retailerId} targetId={editingProduct?.id} images={editingProduct?.images || []} presets={[{ label: "Product photo · 1:1", ratio: 1 }]} altText={productForm.name} onChange={(images) => { const primary = images.find(({ isPrimary }) => isPrimary); setEditingProduct((previous) => previous ? { ...previous, images, image: primary?.url || null, imageAlt: primary?.altText || productForm.name } : previous); setProducts((previous) => previous.map((item) => item.id === editingProduct?.id ? { ...item, images, image: primary?.url || null, imageAlt: primary?.altText || productForm.name } : item)); }} /></section>
          <div className="workspace-form-actions"><span className="workspace-form-actions-spacer" />{editingProduct && <button type="button" className="workspace-secondary-button" onClick={() => { setEditingProduct(null); setProductForm({ name: "", slug: "", description: "", brand: "", categoryId: initialCategories[0]?.id || "", storeId: currentStore?.id || "" }); }}>Cancel</button>}<button className="retailer-button retailer-button-primary" disabled={busy || !initialCategories.length}>{busy ? "Saving…" : editingProduct ? "Save product" : "Add product"} <Check size={16} /></button></div>
        </form>
        <section className="workspace-panel workspace-offer-panel workspace-product-catalogue"><div className="workspace-panel-heading"><div><h2>Your products</h2><p>{products.length} product{products.length === 1 ? "" : "s"} in your catalogue</p></div></div>{products.length > 0 && <label className="workspace-product-search"><MagnifyingGlass size={17} /><input type="search" aria-label="Search products" placeholder="Search your products" value={productSearch} onChange={(event) => setProductSearch(event.target.value)} /></label>}{products.length ? filteredProducts.length ? <div className="workspace-product-list">{filteredProducts.map((product) => <article className="workspace-product-row" key={product.id}><span className="workspace-product-avatar">{product.image ? <img src={product.image} alt={product.imageAlt || product.name} /> : <ShoppingBag size={18} />}</span><div><strong>{product.name}</strong><p>{product.description || product.category?.name || "No description added"}</p><small>{product.brand || product.category?.name || "Product"} · {product.status.toLowerCase()}</small></div><div className="workspace-product-actions"><button type="button" onClick={() => startProductEdit(product)}>Edit</button><button type="button" onClick={() => removeProduct(product)} disabled={busy}>Archive</button></div></article>)}</div> : <div className="workspace-empty"><h3>No matching products</h3><p>Try another product name or category.</p></div> : <div className="workspace-empty"><span><ShoppingBag size={21} /></span><h3>No products yet</h3><p>Add products to your catalogue so offers can feature them.</p></div>}</section>
      </>}
      {section === "offers" && <>
        {!stores.length && <section className="workspace-panel workspace-prerequisite" role="status"><div><strong>Set up your store before creating an offer</strong><p>Offers must belong to a store customers can visit.</p></div><button type="button" className="retailer-button retailer-button-primary" onClick={() => setSection("store")}>Create store profile</button></section>}
        <form className="workspace-panel workspace-form-panel workspace-deal-form workspace-deal-wizard" onSubmit={(event) => { event.preventDefault(); if (dealStep < 5) goToDealStep(dealStep + 1); }}>
          <div className="workspace-form-titlebar"><div><span className="workspace-form-step">{editingDeal ? "EDIT OFFER" : "CREATE OFFER"}</span><h2>{editingDeal ? "Edit your offer" : "Create a deal"}</h2><p>Prepare an offer for nearby customers in five simple steps.</p></div><span className="workspace-draft-badge">{editingDeal?.status || "Draft"}</span></div>
          <div className="deal-wizard-progress" aria-label={"Step " + dealStep + " of 5"}>{["Basic offer", "Pricing", "Details", "Image", "Preview"].map((label, index) => <button key={label} type="button" className={dealStep === index + 1 ? "active" : dealStep > index + 1 ? "complete" : ""} aria-current={dealStep === index + 1 ? "step" : undefined} disabled={index + 1 > dealStep + 1} onClick={() => goToDealStep(index + 1)}><span>{dealStep > index + 1 ? <Check size={14} /> : index + 1}</span><small>{label}</small></button>)}</div>
          <section className="workspace-form-section deal-wizard-step" aria-labelledby="deal-wizard-step-title">
            {dealStep === 1 && <><div className="workspace-form-section-heading"><span>01</span><div><h3 id="deal-wizard-step-title">Basic offer</h3><p>Start with the essentials. Add more when you are ready.</p></div></div><div className="workspace-form-grid"><WorkspaceField label="Offer title" required><input required minLength={2} maxLength={180} placeholder="e.g. 20% off selected kurtas" value={dealForm.title} onChange={(event) => setDealForm({ ...dealForm, title: event.target.value })} /></WorkspaceField><WorkspaceField label="Store" required><select required value={dealForm.storeId} onChange={(event) => setDealForm({ ...dealForm, storeId: event.target.value })}>{stores.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></WorkspaceField><WorkspaceField label="Category" required><select required value={dealForm.categoryId} onChange={(event) => setDealForm({ ...dealForm, categoryId: event.target.value })}>{initialCategories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></WorkspaceField><WorkspaceField label="Short description"><textarea rows={3} maxLength={320} placeholder="A short summary customers see on the deal card" value={dealForm.summary} onChange={(event) => setDealForm({ ...dealForm, summary: event.target.value })} /></WorkspaceField></div></>}
            {dealStep === 2 && <><div className="workspace-form-section-heading"><span>02</span><div><h3 id="deal-wizard-step-title">Offer pricing</h3><p>Prices are optional. We calculate the offer price from the discount.</p></div></div><div className="workspace-form-grid"><WorkspaceField label="Discount type" required><select value={dealForm.offerType} onChange={(event) => setDealForm({ ...dealForm, offerType: event.target.value, offerPrice: "" })}><option value="PERCENTAGE">Percentage discount</option><option value="FIXED_AMOUNT">Fixed amount off</option><option value="BUY_X_GET_Y">Bundle / buy one get one</option><option value="OTHER">Other offer</option></select></WorkspaceField>{dealForm.offerType === "PERCENTAGE" && <WorkspaceField label="Discount percent" required><div className="workspace-input-suffix"><input type="number" min="1" max="100" required value={dealForm.discount} onChange={(event) => updateDealPricing("discount", event.target.value)} /><span>%</span></div></WorkspaceField>}{dealForm.offerType === "FIXED_AMOUNT" && <WorkspaceField label="Discount amount" required><div className="workspace-input-prefix"><span>₹</span><input type="number" min="0.01" step="0.01" required value={dealForm.discountAmount} onChange={(event) => updateDealPricing("discountAmount", event.target.value)} /></div></WorkspaceField>}<WorkspaceField label="Original price"><div className="workspace-input-prefix"><span>₹</span><input type="number" min="0.01" step="0.01" inputMode="decimal" placeholder="Optional" value={dealForm.originalPrice} onChange={(event) => updateDealPricing("originalPrice", event.target.value)} /></div></WorkspaceField><WorkspaceField label="Offer price"><div className="workspace-input-prefix"><span>₹</span><input type="number" min="0.01" step="0.01" inputMode="decimal" placeholder="Calculated automatically" value={dealForm.offerPrice} onChange={(event) => setDealForm({ ...dealForm, offerPrice: event.target.value })} /></div></WorkspaceField>{dealForm.originalPrice && dealForm.offerPrice && <div className="deal-price-result" role="status"><Check size={17} /><span><strong>{"Customer pays ₹" + Number(dealForm.offerPrice).toLocaleString("en-IN")}</strong><small>{"Save ₹" + Math.max(0, Number(dealForm.originalPrice) - Number(dealForm.offerPrice)).toLocaleString("en-IN") + " from ₹" + Number(dealForm.originalPrice).toLocaleString("en-IN")}</small></span></div>}</div><p className="workspace-field-note">For percentage offers, the original price is optional.</p></>}
            {dealStep === 3 && <><div className="workspace-form-section-heading"><span>03</span><div><h3 id="deal-wizard-step-title">Offer details</h3><p>Provide details and validity. Terms and products are optional for a draft.</p></div></div><div className="workspace-form-grid"><WorkspaceField label="Detailed description"><textarea rows={4} maxLength={10000} placeholder="What is included in this offer?" value={dealForm.details} onChange={(event) => setDealForm({ ...dealForm, details: event.target.value })} /></WorkspaceField><WorkspaceField label="Terms and conditions"><textarea rows={4} maxLength={10000} placeholder="Optional for your draft. Add eligibility or exclusions." value={dealForm.terms} onChange={(event) => setDealForm({ ...dealForm, terms: event.target.value })} /></WorkspaceField><WorkspaceField label="Starts on" required><input type="date" required value={dealForm.startsAt} onChange={(event) => setDealForm({ ...dealForm, startsAt: event.target.value })} /></WorkspaceField><WorkspaceField label="Expires on" required><input type="date" required min={dealForm.startsAt} value={dealForm.endsAt} onChange={(event) => setDealForm({ ...dealForm, endsAt: event.target.value })} /></WorkspaceField><div className="workspace-field workspace-field-wide"><span>Featured products <small>Optional</small></span>{products.filter((item) => item.status !== "ARCHIVED").length ? <div className="workspace-product-picker">{products.filter((item) => item.status !== "ARCHIVED").map((item) => <label key={item.id}><input type="checkbox" checked={dealForm.productIds.includes(item.id)} onChange={(event) => setDealForm({ ...dealForm, productIds: event.target.checked ? [...dealForm.productIds, item.id] : dealForm.productIds.filter((id) => id !== item.id) })} /><span><strong>{item.name}</strong><small>{item.category?.name || "Product"}</small></span></label>)}</div> : <p className="workspace-field-note">Optional. Add products in Products to feature them here.</p>}</div></div></>}
            {dealStep === 4 && <><div className="workspace-form-section-heading"><span>04</span><div><h3 id="deal-wizard-step-title">Promotional image</h3><p>Upload a customer-facing image, or keep the suggested category artwork.</p></div></div><div className="workspace-offer-image-field"><div className="workspace-offer-image-control"><div className="workspace-image-preview-tile"><img src={dealImage || dealForm.imageReference || suggestedOfferImage(categoryName(dealForm.categoryId), dealForm.title).src} alt="Offer artwork preview" /><span>Offer image preview</span></div><div className="deal-image-editor"><RetailerMediaPicker label="Offer gallery" purpose="DEAL" retailerId={retailerId} targetId={editingDeal?.id} images={dealImages} presets={[{ label: "Portrait offer · 4:5", ratio: 4 / 5 }, { label: "Wide offer banner · 16:9", ratio: 16 / 9 }]} altText={dealForm.title} disabled={busy} onChange={(images) => { setDealImages(images); const primary = images.find(({ isPrimary }) => isPrimary); setDealImage(primary?.url || ""); if (primary) setDealForm((previous) => ({ ...previous, imageReference: "" })); }} />{!editingDeal?.id && <p className="workspace-field-note">Save this offer as a draft first. You can then upload and preview its image here.</p>}<WorkspaceField label="External image URL (optional)"><input type="url" inputMode="url" placeholder="https://…" value={dealForm.imageReference} onChange={(event) => setDealForm({ ...dealForm, imageReference: event.target.value })} /></WorkspaceField>{dealForm.imageReference && <button type="button" className="workspace-secondary-button" onClick={() => setDealForm({ ...dealForm, imageReference: "" })}>Clear external image URL</button>}</div></div></div></>}
            {dealStep === 5 && <><div className="workspace-form-section-heading"><span>05</span><div><h3 id="deal-wizard-step-title">Preview and publish</h3><p>Review the customer view, save your draft, then publish when ready.</p></div></div><div className="workspace-preview-layout"><article className="workspace-marketplace-card"><div className="workspace-marketplace-image"><img src={dealImage || dealForm.imageReference || suggestedOfferImage(categoryName(dealForm.categoryId), dealForm.title).src} alt={dealForm.title || "Offer artwork"} /><span>{dealForm.offerType === "PERCENTAGE" ? dealForm.discount + "% OFF" : dealForm.offerType === "FIXED_AMOUNT" ? "₹" + (dealForm.discountAmount || 0) + " OFF" : "SPECIAL OFFER"}</span></div><div className="workspace-marketplace-content"><div className="workspace-preview-store-brand"><span><Storefront size={16} /></span><div><strong>{currentStore?.name || store?.storeName}</strong><small>{categoryName(dealForm.categoryId)}</small></div></div><h3>{dealForm.title || "Your offer title"}</h3><p>{dealForm.summary || "Your short offer summary will appear here."}</p><div className="workspace-preview-prices">{dealForm.originalPrice && <del>{"₹" + Number(dealForm.originalPrice).toLocaleString("en-IN")}</del>}{dealForm.offerPrice && <strong>{"₹" + Number(dealForm.offerPrice).toLocaleString("en-IN")}</strong>}<span>{categoryName(dealForm.categoryId)}</span></div><div className="workspace-preview-dates"><CalendarBlank size={15} />{dealForm.startsAt} – {dealForm.endsAt}</div></div></article><aside className="workspace-preview-terms"><h3>Offer details</h3><p>{dealForm.details || dealForm.summary || "No additional description yet."}</p><h4>Terms and conditions</h4><p>{dealForm.terms || "Add terms when you are ready to publish. A draft can be saved without them."}</p><div><span>Store</span><strong>{currentStore?.name || store?.storeName}</strong></div></aside></div></>}
          </section>
          {error && <p className="flow-error" role="alert">{error}</p>}
          <div className="deal-wizard-footer"><button type="button" className="workspace-secondary-button" onClick={saveDealDraft} disabled={busy}>{busy ? "Saving…" : "Save draft"}</button><span className="workspace-form-actions-spacer" />{dealStep > 1 && <button type="button" className="workspace-secondary-button" onClick={() => goToDealStep(dealStep - 1)}>Back</button>}{dealStep < 5 ? <button type="button" className="retailer-button retailer-button-primary" onClick={() => goToDealStep(dealStep + 1)}>Continue <ArrowRight size={16} /></button> : <><button type="button" className="workspace-secondary-button" onClick={() => setDealPreview({ ...dealForm, offerType: dealForm.offerType, discountBps: Math.round(Number(dealForm.discount) * 100), store: currentStore, category: initialCategories.find((item) => item.id === dealForm.categoryId), image: dealImage || dealForm.imageReference || suggestedOfferImage(categoryName(dealForm.categoryId), dealForm.title).src })}>Full preview</button><button type="button" className="retailer-button retailer-button-primary" disabled={busy || editingDeal?.status === "published"} onClick={publishWizard}>Publish offer <ArrowRight size={16} /></button></>}</div>
        </form>        {dealPreview && <section className="workspace-panel workspace-customer-preview"><div className="workspace-preview-heading"><div><p className="retailer-eyebrow"><span /> CUSTOMER PREVIEW</p><h2>This is how the offer appears</h2></div><button type="button" className="workspace-secondary-button" onClick={() => setDealPreview(null)}>Close preview</button></div><div className="workspace-preview-layout"><article className="workspace-marketplace-card"><div className="workspace-marketplace-image"><img src={dealPreview.image || dealPreview.imageReference || suggestedOfferImage(categoryName(dealPreview.categoryId), dealPreview.title).src} alt={dealPreview.title || "Offer artwork"} /><span>{String(dealPreview.offerType || dealForm.offerType).toUpperCase() === "PERCENTAGE" ? `${Number(dealPreview.discountBps || Number(dealForm.discount) * 100) / 100}% OFF` : String(dealPreview.offerType || dealForm.offerType).toUpperCase() === "FIXED_AMOUNT" ? `₹${Number(dealPreview.discountAmountMinor || Number(dealForm.discountAmount) * 100) / 100} OFF` : "SPECIAL OFFER"}</span></div><div className="workspace-marketplace-content"><div className="workspace-preview-store-brand"><span><Storefront size={16} /></span><div><strong>{dealPreview.store?.name || dealPreview.storeName || currentStore?.name || store?.storeName}</strong><small>{dealPreview.category?.name || categoryName(dealPreview.categoryId)}</small></div></div><h3>{dealPreview.title || "Your offer title"}</h3><p>{dealPreview.summary || dealPreview.description || dealPreview.details || "Add a short description so customers know what is included."}</p><div className="workspace-preview-prices">{(dealPreview.originalPriceMinor || dealForm.originalPrice) && <del>₹{Number(dealPreview.originalPriceMinor || Number(dealForm.originalPrice) * 100) / 100}</del>}{(dealPreview.offerPriceMinor || dealForm.offerPrice) && <strong>₹{Number(dealPreview.offerPriceMinor || Number(dealForm.offerPrice) * 100) / 100}</strong>}<span>{dealPreview.category?.name || categoryName(dealPreview.categoryId)}</span></div><div className="workspace-preview-dates"><CalendarBlank size={15} />{(dealPreview.startsAt || dealPreview.startDate || dealForm.startsAt)?.slice(0, 10)} – {(dealPreview.endsAt || dealPreview.endDate || dealForm.endsAt)?.slice(0, 10)}</div></div></article><aside className="workspace-preview-terms"><h3>Offer details</h3><p>{dealPreview.details || dealPreview.summary || dealForm.details || dealForm.summary || "More offer details will appear here."}</p><h4>Terms and conditions</h4><p>{dealPreview.terms || dealForm.terms || "Your offer terms will appear here."}</p><div><span>Offer status</span><strong>{dealPreview.status || "Draft preview"}</strong></div></aside></div></section>}
        <section className="workspace-panel workspace-offer-panel"><div className="workspace-panel-heading"><div><h2>Your offers</h2><p>Draft, publish, or pause offers from your catalogue.</p></div></div>{offers.length ? offers.map((deal) => <article className="workspace-offer-row" key={deal.id}><img className="workspace-offer-thumb" src={deal.image || suggestedOfferImage(deal.category || "", deal.title).src} alt="" /><div><strong>{deal.title}</strong><p>{deal.description || deal.summary}</p><small>{deal.startDate || deal.startsAt?.slice(0, 10)} – {deal.endDate || deal.endsAt?.slice(0, 10)}</small></div><span className="workspace-draft-status">{deal.status}</span><button type="button" onClick={() => editDeal(deal)}>Edit</button><button type="button" onClick={() => preview(deal)} disabled={busy}>Preview</button>{deal.status === "published" ? <button type="button" onClick={() => pause(deal)} disabled={busy}>Pause</button> : deal.status !== "ended" && <button type="button" onClick={() => publish(deal)} disabled={busy}>Publish</button>}</article>) : <div className="workspace-empty"><h3>No deals yet</h3><p>Your saved drafts and published offers will appear here.</p></div>}</section>
      </>}
    </div></section><nav className="workspace-mobile-nav" aria-label="Retailer mobile navigation"><button type="button" className={section === "overview" ? "active" : ""} onClick={() => navTo("overview")}><span>⌂</span>Home</button><button type="button" className={section === "offers" ? "active" : ""} onClick={() => navTo("offers")}><span>◇</span>Offers</button><button type="button" className="workspace-mobile-create" onClick={startNewDeal}><span>＋</span>Create</button><button type="button" className={section === "products" ? "active" : ""} onClick={() => navTo("products")}><span>▦</span>Products</button><button type="button" className={section === "store" ? "active" : ""} onClick={() => navTo("store")}><span>▣</span>Store</button><button type="button" className={section === "account" ? "active" : ""} onClick={() => navTo("account")}><span>◉</span>Account</button></nav>{dealPreview && <div className="toast" role="status"><Check size={16} /> Preview loaded</div>}</main>;
}

function RetailerWorkspacePreview({ store, retailerSession, redemptions = [], onCompleteRedemption = () => {}, onExit, onSignOut, onOpenQrScanner }) {
  const [section, setSection] = useState("overview");
  const [offers, setOffers] = useState([]);
  const [creating, setCreating] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [errors, setErrors] = useState({});
  const blankOffer = { title: "", description: "", startDate: "", endDate: "", terms: "", image: "", imageAlt: "", imageSource: "suggested" };
  const [offerForm, setOfferForm] = useState(blankOffer);
  const [imageLoading, setImageLoading] = useState(false);
  const [imageMessage, setImageMessage] = useState("");
  const [previewingOffer, setPreviewingOffer] = useState(null);
  const [redemptionCode, setRedemptionCode] = useState("");
  const [redemptionLookup, setRedemptionLookup] = useState(null);
  const [redemptionMessage, setRedemptionMessage] = useState("");
  const imageInputRef = useRef(null);
  const [ideaPrompt, setIdeaPrompt] = useState("");
  const [aiIdeas, setAiIdeas] = useState([]);
  const [ideasLoading, setIdeasLoading] = useState(false);
  const [ideasMessage, setIdeasMessage] = useState("");
  const firstName = store.ownerName.split(" ")[0];
  const storeRedemptions = redemptions.filter((item) => item.storeName.trim().toLowerCase() === store.storeName.trim().toLowerCase());
  const availableRedemptions = storeRedemptions.filter((item) => item.status === "unused");
  const completedRedemptions = storeRedemptions.filter((item) => item.status === "redeemed");
  const updateOffer = (key, value) => {
    setOfferForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: "" }));
  };
  const useStarter = (starter) => {
    setOfferForm((current) => ({ ...current, title: starter.title, description: starter.description, terms: starter.terms }));
    setErrors((current) => ({ ...current, title: "", description: "", terms: "" }));
    setIdeasMessage("Starter added. Replace each [bracketed detail] with your real offer.");
  };
  const setOfferDuration = (days) => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + days - 1);
    const localDate = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    updateOffer("startDate", localDate(start));
    updateOffer("endDate", localDate(end));
  };
  const handleOfferImageUpload = (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
      setImageMessage("Choose a PNG, JPG, or WebP image.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setImageMessage("Choose an image under 5 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const image = typeof reader.result === "string" ? reader.result : "";
      if (!image) {
        setImageMessage("This image could not be loaded. Try another file.");
        return;
      }
      setOfferForm((current) => ({ ...current, image, imageAlt: `Retailer-provided image for ${current.title || "this offer"}`, imageSource: "retailer" }));
      setImageMessage("Your image is ready for the offer preview.");
    };
    reader.onerror = () => setImageMessage("This image could not be loaded. Try another file.");
    reader.readAsDataURL(file);
  };
  const generateOfferImage = async () => {
    if (!offerForm.title.trim() || !offerForm.description.trim()) {
      setImageMessage("Add an offer headline and description first, so the image can match.");
      return;
    }
    setImageLoading(true);
    setImageMessage("");
    try {
      const response = await fetch("/api/offer-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: store.category, title: offerForm.title.trim().slice(0, 100), description: offerForm.description.trim().slice(0, 180) }),
      });
      const isJson = response.headers.get("content-type")?.includes("application/json");
      const result = isJson ? await response.json().catch(() => ({})) : {};
      if (!response.ok || !result.image) {
        setImageMessage([404, 503].includes(response.status)
          ? "AI images aren’t connected in this preview. Use the suggested image or upload your own."
          : "Couldn’t generate an image right now. Your offer details are still here.");
        return;
      }
      setOfferForm((current) => ({ ...current, image: result.image, imageAlt: `AI-generated illustrative image for ${current.title}`, imageSource: "ai" }));
      setImageMessage("AI image added. Review it before saving; it is illustrative, not a photo of your exact product.");
    } catch {
      setImageMessage("AI images aren’t reachable in this preview. Use the suggested image or upload your own.");
    } finally {
      setImageLoading(false);
    }
  };
  const useSuggestedImage = () => {
    setOfferForm((current) => ({ ...current, image: "", imageAlt: "", imageSource: "suggested" }));
    setImageMessage("Using the image suggested for this category and offer.");
  };
  const openCustomerOfferPreview = () => {
    const suggestion = suggestedOfferImage(store.category, `${offerForm.title} ${offerForm.description}`);
    setPreviewingOffer({ ...offerForm, image: offerForm.image || suggestion.src, imageAlt: offerForm.imageAlt || suggestion.alt, category: store.category, storeName: store.storeName, area: store.area, city: store.city });
  };
  const verifyRedemptionCode = () => {
    const normalized = redemptionCode.trim().toUpperCase().replace(/[\s-]/g, "");
    if (!normalized) {
      setRedemptionLookup(null);
      setRedemptionMessage("Enter the code shown by the customer.");
      return;
    }
    const match = [...redemptions, ...customerOffers].find((item) => item?.code && item.code.toUpperCase().replace(/[\s-]/g, "") === normalized);
    setRedemptionMessage("");
    if (!match) {
      setRedemptionLookup({ status: "invalid" });
      return;
    }
    if (match.storeName.trim().toLowerCase() !== store.storeName.trim().toLowerCase()) {
      setRedemptionLookup({ status: "wrong-store" });
      return;
    }
    if (match.status === "redeemed" || match.status === "used") {
      setRedemptionLookup({ ...match, status: "redeemed" });
      return;
    }
    const deadline = new Date(`${match.validUntil} 23:59:59`);
    if (!Number.isNaN(deadline.getTime()) && deadline.getTime() < Date.now()) {
      setRedemptionLookup({ ...match, status: "expired" });
      return;
    }
    if (!match.userId && !match.customerId) {
      setRedemptionLookup({ status: "invalid" });
      return;
    }
    setRedemptionLookup({ ...match, status: "available", customerId: match.userId || match.customerId, scannedPayload: match.qrPayload || "" });
  };
  const confirmRedemption = async () => {
    if (redemptionLookup?.status !== "available") return;
    try {
      const result = await redeemOfferViaApi({
        code: redemptionLookup.code,
        offerId: redemptionLookup.offerId,
        offerTitle: redemptionLookup.offerTitle,
        storeName: redemptionLookup.storeName,
        userId: redemptionLookup.userId || redemptionLookup.customerId,
        customerId: redemptionLookup.userId || redemptionLookup.customerId,
        scannedPayload: redemptionLookup.scannedPayload || redemptionLookup.qrPayload || null,
      });
      onCompleteRedemption(redemptionLookup.code);
      completeOfferCode(redemptionLookup.code);
      setRedemptionLookup({ ...redemptionLookup, status: "redeemed", redeemedAt: new Date().toISOString(), apiResult: result });
      setRedemptionMessage(`Offer redeemed for ${redemptionLookup.customerName || "the customer"}. ${result?.message || "The code was removed from the customer app and added to redemption history."}`);
      setSection("activity");
    } catch (error) {
      setRedemptionLookup({ ...redemptionLookup, status: "invalid", errorMessage: error.message || "This offer could not be redeemed." });
      setRedemptionMessage(error.message || "This offer could not be redeemed.");
    }
  };
  const openRedemption = () => {
    setRedemptionCode("");
    setRedemptionLookup(null);
    setRedemptionMessage("");
    setSection("redeem");
    setCreating(false);
  };
  const getAiIdeas = async () => {
    setIdeasLoading(true);
    setIdeasMessage("");
    setAiIdeas([]);
    try {
      const response = await fetch("/api/offer-ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: store.category, idea: ideaPrompt.trim().slice(0, 240) }),
      });
      const isJson = response.headers.get("content-type")?.includes("application/json");
      const result = isJson ? await response.json().catch(() => ({})) : {};
      if (!response.ok) {
        setIdeasMessage([404, 503].includes(response.status)
          ? "Gemini isn’t connected to this preview yet. Use a quick start below, or add the server-side Gemini setup."
          : "Couldn’t get ideas right now. Your offer details are still here—try a quick start instead.");
        return;
      }
      if (!isJson) {
        setIdeasMessage("Gemini isn’t connected to this preview yet. Use a quick start below, or add the server-side Gemini setup.");
        return;
      }
      const validIdeas = Array.isArray(result.ideas) ? result.ideas.filter((idea) => idea && idea.title && idea.description && idea.terms).slice(0, 3) : [];
      setAiIdeas(validIdeas);
      if (!validIdeas.length) setIdeasMessage("No ideas came back this time. Try a quick start below.");
    } catch {
      setIdeasMessage("Gemini isn’t reachable in this preview. Your details are still here—try a quick start instead.");
    } finally {
      setIdeasLoading(false);
    }
  };
  const applyAiIdea = (idea) => {
    setOfferForm((current) => ({ ...current, title: idea.title, description: idea.description, terms: idea.terms }));
    setErrors((current) => ({ ...current, title: "", description: "", terms: "" }));
    setIdeasMessage("Idea added. Review and edit every detail before saving your draft.");
    setAiIdeas([]);
  };
  const startOffer = (offer = null) => {
    setOfferForm(offer ? { ...blankOffer, ...offer } : blankOffer);
    setEditingId(offer?.id || null);
    setErrors({});
    setIdeaPrompt("");
    setAiIdeas([]);
    setIdeasMessage("");
    setImageMessage("");
    setReviewing(false);
    setCreating(true);
    setSection("offers");
  };
  const previewOffer = () => {
    const nextErrors = {};
    if (!offerForm.title.trim()) nextErrors.title = "Add an offer title.";
    else if (/[\[\]]/.test(offerForm.title)) nextErrors.title = "Replace the bracketed details with your offer.";
    if (!offerForm.description.trim()) nextErrors.description = "Describe what customers receive.";
    else if (/[\[\]]/.test(offerForm.description)) nextErrors.description = "Replace the bracketed details with your offer.";
    if (!offerForm.startDate) nextErrors.startDate = "Choose a start date.";
    if (!offerForm.endDate) nextErrors.endDate = "Choose an end date.";
    if (offerForm.startDate && offerForm.endDate && offerForm.endDate < offerForm.startDate) nextErrors.endDate = "End date must be after the start date.";
    if (!offerForm.terms.trim()) nextErrors.terms = "Add clear offer terms.";
    else if (/[\[\]]/.test(offerForm.terms)) nextErrors.terms = "Replace the bracketed details with your offer.";
    setErrors(nextErrors);
    if (!Object.keys(nextErrors).length) setReviewing(true);
  };
  const saveDraft = () => {
    const suggestion = suggestedOfferImage(store.category, `${offerForm.title} ${offerForm.description}`);
    const record = { ...offerForm, image: offerForm.image || suggestion.src, imageAlt: offerForm.imageAlt || suggestion.alt, imageSource: offerForm.imageSource || "suggested", id: editingId || `draft-${Date.now()}`, status: "Draft preview" };
    setOffers((current) => editingId ? current.map((offer) => offer.id === editingId ? record : offer) : [record, ...current]);
    setCreating(false);
    setReviewing(false);
    setEditingId(null);
    setOfferForm(blankOffer);
  };
  const dateLabel = (value) => value ? new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "Not set";

  return <main className="retailer-workspace">
    <aside className="workspace-sidebar">
      <a className="workspace-brand" href="#workspace" onClick={(event) => event.preventDefault()}><img src="/assets/dealse-logo.png" alt="" /><span><strong>DealSe</strong><small>Retailer workspace</small></span></a>
      <div className="workspace-store-chip"><span className="workspace-store-icon"><Storefront size={19} /></span><span><strong>{store.storeName}</strong><small>{store.area}, {store.city}</small></span></div>
      <nav aria-label="Retailer workspace">
        <button type="button" className={section === "overview" ? "active" : ""} onClick={() => { setSection("overview"); setCreating(false); }}><span className="workspace-nav-icon">⌂</span>Overview</button>
        <button type="button" className={section === "offers" ? "active" : ""} onClick={() => { setSection("offers"); setCreating(false); }}><span className="workspace-nav-icon">◇</span>Offers <span className="workspace-nav-count">{offers.length}</span></button>
        <button type="button" className={section === "redeem" ? "active" : ""} onClick={openRedemption}><span className="workspace-nav-icon"><QrCode size={14} /></span>Redeem <span className="workspace-nav-count">{availableRedemptions.length}</span></button>
        <button type="button" className={section === "activity" ? "active" : ""} onClick={() => { setSection("activity"); setCreating(false); }}><span className="workspace-nav-icon">◷</span>Activity <span className="workspace-nav-count">{storeRedemptions.length}</span></button>
        <button type="button" className={section === "profile" ? "active" : ""} onClick={() => { setSection("profile"); setCreating(false); }}><span className="workspace-nav-icon">▣</span>Store profile</button>
        <button type="button" className={section === "account" ? "active" : ""} onClick={() => { setSection("account"); setCreating(false); }}><UserCircle size={15} />Account</button>
      </nav>
      <div className="workspace-sidebar-bottom"><span className="workspace-preview-note"><i /> Preview workspace</span><button type="button" onClick={onExit}>Back to For Stores <ArrowRight size={15} /></button></div>
    </aside>

    <section className="workspace-main">
      <header className="workspace-topbar"><div><span className="workspace-mobile-brand"><img src="/assets/dealse-logo.png" alt="" />DealSe</span><p>Retailer workspace <span>/</span> {creating ? "Create offer" : section === "overview" ? "Overview" : section === "offers" ? "Offers" : section === "redeem" ? "Redeem offer" : section === "activity" ? "Redemption activity" : section === "account" ? "Account" : "Store profile"}</p></div><span className="workspace-top-status">PREVIEW · SESSION ONLY</span></header>
      {section === "overview" && <div className="workspace-content">
        <div className="workspace-welcome"><div><p className="retailer-eyebrow"><span /> YOUR STORE WORKSPACE</p><h1>Welcome, {firstName}.</h1><p>A clear place to prepare your store profile and offers.</p></div><button type="button" className="retailer-button retailer-button-primary" onClick={() => startOffer()}>Create an offer <ArrowRight size={16} /></button></div>
        <div className="workspace-stat-grid"><article><span className="workspace-stat-icon"><CalendarBlank size={19} /></span><small>Offer drafts</small><strong>{offers.length}</strong><em>Current page session</em></article><article><span className="workspace-stat-icon"><QrCode size={19} /></span><small>Codes ready to redeem</small><strong>{availableRedemptions.length}</strong><em>Only for this store</em></article><article><span className="workspace-stat-icon"><Check size={19} /></span><small>Redeemed in preview</small><strong>{completedRedemptions.length}</strong><em>Demo activity only</em></article></div>
        <div className="workspace-dashboard-grid"><section className="workspace-panel workspace-offer-panel"><div className="workspace-panel-heading"><div><h2>Your offers</h2><p>Review offer drafts prepared for your store.</p></div><button type="button" onClick={() => { setSection("offers"); setCreating(false); }}>Manage offers <ArrowRight size={14} /></button></div>{offers.length ? <OfferRows offers={offers.slice(0, 3)} onEdit={startOffer} /> : <div className="workspace-empty"><span><CalendarBlank size={22} /></span><h3>Start with your first offer</h3><p>Add clear terms, dates, and an image, then check the customer view.</p><button type="button" className="retailer-button retailer-button-primary" onClick={() => startOffer()}>Create an offer <ArrowRight size={15} /></button></div>}</section><section className="workspace-panel workspace-quick-panel"><div className="workspace-panel-heading"><div><h2>At the counter</h2><p>Check the customer’s offer before confirming it.</p></div><span className="workspace-quick-icon"><QrCode size={19} /></span></div><ol><li>Ask the customer to show their offer code.</li><li>Enter the code and check the store and offer.</li><li>Confirm once; the code can’t be reused in this session.</li></ol><button type="button" className="retailer-button retailer-button-primary" onClick={openRedemption}>Redeem an offer <ArrowRight size={15} /></button><div className="workspace-recent-heading"><strong>Recent redemption activity</strong><button type="button" onClick={() => { setSection("activity"); setCreating(false); }}>View activity</button></div>{storeRedemptions.length ? <div className="workspace-recent-list">{storeRedemptions.slice(0, 3).map((item) => <div key={item.code}><span className={`workspace-activity-dot ${item.status}`} /><span><strong>{item.offerTitle}</strong><small>{item.code} · {item.status === "redeemed" ? "Redeemed" : "Code issued"}</small></span><time>{new Date(item.redeemedAt || item.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</time></div>)}</div> : <p className="workspace-no-activity">No codes yet. Your first customer redemption will appear here.</p>}</section></div>
        <p className="workspace-footnote"><strong>Preview mode.</strong> Offer and redemption records stay in this page session. No sales, visits, or live redemption metrics are being reported.</p>
      </div>}

      {section === "offers" && <div className="workspace-content">
        <div className="workspace-welcome workspace-list-heading"><div><p className="retailer-eyebrow"><span /> MANAGE YOUR OFFERS</p><h1>{creating ? (reviewing ? "Review your offer" : editingId ? "Edit offer draft" : "Create an offer") : "Offers"}</h1><p>{creating ? "Check the customer-facing details before saving a draft." : "Create and review offers for your store."}</p></div>{!creating && <button type="button" className="retailer-button retailer-button-primary" onClick={() => startOffer()}>Create an offer <ArrowRight size={16} /></button>}</div>
        {creating ? <div className="workspace-compose-layout"><section className="workspace-panel workspace-form-panel">{!reviewing ? <><OfferIdeaPicker category={store.category} prompt={ideaPrompt} onPromptChange={setIdeaPrompt} ideas={aiIdeas} loading={ideasLoading} message={ideasMessage} onAskAi={getAiIdeas} onUseIdea={applyAiIdea} onUseStarter={useStarter} /><div className="workspace-form-grid"><WorkspaceField label="Offer headline" required error={errors.title}><input value={offerForm.title} placeholder="e.g. 10% off selected items" onChange={(event) => updateOffer("title", event.target.value)} /><small className="workspace-field-hint">Include the actual item and offer value.</small></WorkspaceField><WorkspaceField label="What customers get" required error={errors.description} wide><textarea value={offerForm.description} maxLength={180} placeholder="Describe what’s included and who it’s for" onChange={(event) => updateOffer("description", event.target.value)} /><small className="workspace-field-hint">Keep it specific. You can edit the AI draft. {offerForm.description.length}/180 characters</small></WorkspaceField><div className="workspace-schedule-shortcuts workspace-field-wide"><span>Set a duration</span><button type="button" onClick={() => setOfferDuration(7)}>Next 7 days</button><button type="button" onClick={() => setOfferDuration(14)}>Next 14 days</button><small>Choose exact dates below if you prefer.</small></div><WorkspaceField label="Starts on" required error={errors.startDate}><input type="date" value={offerForm.startDate} onInput={(event) => updateOffer("startDate", event.currentTarget.value)} onChange={(event) => updateOffer("startDate", event.target.value)} /></WorkspaceField><WorkspaceField label="Ends on" required error={errors.endDate}><input type="date" value={offerForm.endDate} min={offerForm.startDate || undefined} onInput={(event) => updateOffer("endDate", event.currentTarget.value)} onChange={(event) => updateOffer("endDate", event.target.value)} /></WorkspaceField><WorkspaceField label="Terms customers should know" required error={errors.terms} wide><textarea value={offerForm.terms} maxLength={500} placeholder="List eligible items, exclusions, and any limits" onChange={(event) => updateOffer("terms", event.target.value)} /><small className="workspace-field-hint">Be clear about eligibility and limits. {offerForm.terms.length}/500 characters</small></WorkspaceField><div className="workspace-offer-image-field workspace-field-wide"><span className="workspace-image-label">Offer image <small>Optional</small></span>{(() => { const suggestion = suggestedOfferImage(store.category, `${offerForm.title} ${offerForm.description}`); return <div className="workspace-image-preview"><img src={offerForm.image || suggestion.src} alt={offerForm.imageAlt || suggestion.alt} /><span><strong>{offerForm.imageSource === "ai" ? "AI-generated image" : offerForm.imageSource === "retailer" ? "Your uploaded image" : `Suggested for ${suggestion.label.toLowerCase()}`}</strong><small>Shown on the customer offer card and detail preview.</small></span></div>; })()}<div className="workspace-image-actions"><label className="workspace-image-upload" htmlFor="offer-image-upload">Upload your image</label><input ref={imageInputRef} id="offer-image-upload" className="workspace-file-input" type="file" accept="image/png,image/jpeg,image/webp" onChange={handleOfferImageUpload} /><button type="button" onClick={generateOfferImage} disabled={imageLoading}>{imageLoading ? "Creating image…" : "Generate with AI"}</button>{offerForm.image && <button type="button" className="workspace-image-reset" onClick={useSuggestedImage}>Use suggested image</button>}</div><small className="workspace-image-note">PNG, JPG or WebP · up to 5 MB. Suggested images use the offer category and wording. AI images are illustrative; check them before publishing. Generation may incur Google API charges.</small><small className="workspace-image-privacy">Generate with AI sends the category, offer headline, and description to Google. Do not include confidential information.</small>{imageMessage && <small className="workspace-image-status" role="status">{imageMessage}</small>}</div></div><div className="workspace-form-actions"><button type="button" className="flow-back" onClick={() => setCreating(false)}>Cancel</button><button type="button" className="retailer-button retailer-button-primary" onClick={previewOffer}>Review offer <ArrowRight size={15} /></button></div></> : <><div className="workspace-customer-preview"><img className="workspace-preview-image" src={offerForm.image || suggestedOfferImage(store.category, `${offerForm.title} ${offerForm.description}`).src} alt={offerForm.imageAlt || suggestedOfferImage(store.category, `${offerForm.title} ${offerForm.description}`).alt} /><span className="workspace-preview-pill">CUSTOMER OFFER PREVIEW</span><p className="retailer-eyebrow"><span /> {store.category} · {store.area}, {store.city}</p><h2>{offerForm.title}</h2><p>{offerForm.description}</p><div className="workspace-preview-dates"><CalendarBlank size={16} /> {dateLabel(offerForm.startDate)} – {dateLabel(offerForm.endDate)}</div><hr /><h3>Terms and conditions</h3><p>{offerForm.terms}</p><div className="workspace-preview-store"><Storefront size={18} /><strong>{store.storeName}</strong><span>{store.area}, {store.city}</span></div></div><div className="workspace-form-actions"><button type="button" className="flow-back" onClick={() => setReviewing(false)}>Back to edit</button><button type="button" className="flow-back workspace-customer-preview-action" onClick={openCustomerOfferPreview}>See customer page</button><button type="button" className="retailer-button retailer-button-primary" onClick={saveDraft}>Save draft preview <Check size={16} /></button></div><p className="workspace-footnote"><strong>Draft only.</strong> Saving keeps this offer in the current page session. It is not published or sent to DealSe.</p></>}</section><aside className="workspace-help-card"><span><Check size={18} /></span><h2>Keep it clear</h2><p>Use a specific offer, dates customers can understand, and terms your team can follow in store.</p><small>Live publishing and approval steps are not connected here.</small></aside></div> : offers.length ? <section className="workspace-panel workspace-offer-panel"><OfferRows offers={offers} onEdit={startOffer} /></section> : <section className="workspace-panel workspace-offer-panel"><div className="workspace-empty"><span><CalendarBlank size={22} /></span><h3>No offers yet</h3><p>Your saved draft previews will appear here.</p><button type="button" className="retailer-button retailer-button-primary" onClick={() => startOffer()}>Create your first offer <ArrowRight size={15} /></button></div></section>}
        {!creating && <p className="workspace-footnote"><strong>Preview only.</strong> Offers are stored in this page session and are not published.</p>}
      </div>}

      {section === "redeem" && <div className="workspace-content">
        <div className="workspace-welcome"><div><p className="retailer-eyebrow"><span /> IN-STORE CHECKOUT</p><h1>Redeem a customer offer</h1><p>Check the code, offer, and store before confirming once.</p></div><span className="workspace-ready-badge"><QrCode size={14} /> {availableRedemptions.length} CODE{availableRedemptions.length === 1 ? "" : "S"} READY</span></div>
        <div className="workspace-redeem-layout"><section className="workspace-panel workspace-redeem-panel"><div className="workspace-redeem-heading"><span className="workspace-redeem-icon"><QrCode size={22} /></span><div><h2>Enter the customer’s code</h2><p>Ask the customer to show their DealSe offer code.</p></div></div><label className="workspace-code-field" htmlFor="retailer-redemption-code"><span>Offer code</span><div><input id="retailer-redemption-code" value={redemptionCode} placeholder="DS-AB12-CD34" autoComplete="off" onChange={(event) => { setRedemptionCode(event.target.value); setRedemptionLookup(null); setRedemptionMessage(""); }} onKeyDown={(event) => event.key === "Enter" && verifyRedemptionCode()} /><button type="button" className="retailer-button retailer-button-primary" onClick={verifyRedemptionCode}>Check code</button></div></label><div className="workspace-redeem-scan"><button type="button" className="button button--outline" onClick={onOpenQrScanner}>Open camera QR scanner</button></div>{redemptionMessage && <p className="workspace-redeem-message" role="status">{redemptionMessage}</p>}{redemptionLookup?.status === "available" && <div className="workspace-code-result is-valid" role="status"><span className="workspace-code-result-icon"><Check size={18} weight="bold" /></span><div><strong>Offer is ready to redeem</strong><p>{redemptionLookup.offerTitle}</p><small>For {store.storeName} · Valid through {redemptionLookup.validUntil}</small></div><button type="button" className="retailer-button retailer-button-primary" onClick={confirmRedemption}>Confirm redemption</button></div>}{redemptionLookup?.status === "redeemed" && <div className="workspace-code-result is-used" role="status"><span className="workspace-code-result-icon"><Check size={18} weight="bold" /></span><div><strong>Already redeemed</strong><p>{redemptionLookup.offerTitle}</p><small>This code was used {redemptionLookup.redeemedAt ? `on ${new Date(redemptionLookup.redeemedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}` : "in this session"}.</small></div></div>}{redemptionLookup?.status === "expired" && <div className="workspace-code-result is-invalid" role="alert"><span className="workspace-code-result-icon">!</span><div><strong>This offer has expired</strong><p>Its valid-through date was {redemptionLookup.validUntil}.</p><small>Ask the customer to choose a current offer.</small></div></div>}{redemptionLookup?.status === "wrong-store" && <div className="workspace-code-result is-invalid" role="alert"><span className="workspace-code-result-icon">!</span><div><strong>This code belongs to another store</strong><p>Check the store name on the customer’s offer.</p><small>This code has not been changed.</small></div></div>}{redemptionLookup?.status === "invalid" && <div className="workspace-code-result is-invalid" role="alert"><span className="workspace-code-result-icon">!</span><div><strong>We couldn’t verify that code</strong><p>Check the letters and numbers with the customer, then try again.</p></div></div>}<p className="workspace-redeem-footnote"><strong>Preview verification.</strong> Codes are checked only against this browser session. A live redemption needs server-side validation and one-time locking.</p></section><aside className="workspace-panel workspace-redeem-guide"><h2>At the counter</h2><ol><li><span>1</span><div><strong>Check the store</strong><small>Only codes issued for {store.storeName} can be accepted here.</small></div></li><li><span>2</span><div><strong>Review the offer</strong><small>Confirm the offer and its valid-through date with the customer.</small></div></li><li><span>3</span><div><strong>Confirm once</strong><small>A redeemed code is marked used and can’t be reused in this session.</small></div></li></ol></aside></div>
      </div>}

      {section === "activity" && <div className="workspace-content">
        <div className="workspace-welcome"><div><p className="retailer-eyebrow"><span /> REDEMPTION HISTORY</p><h1>Activity</h1><p>Codes issued for this store and their current status.</p></div><button type="button" className="retailer-button retailer-button-primary" onClick={openRedemption}>Redeem a code <ArrowRight size={15} /></button></div>
        <section className="workspace-panel workspace-activity-panel"><div className="workspace-panel-heading"><div><h2>Offer code activity</h2><p>{storeRedemptions.length} code{storeRedemptions.length === 1 ? "" : "s"} in this session</p></div><span className="workspace-preview-pill">SESSION PREVIEW</span></div>{storeRedemptions.length ? <div className="workspace-activity-list">{storeRedemptions.map((item) => <article className="workspace-activity-row" key={item.code}><span className={`workspace-activity-icon ${item.status}`}><QrCode size={17} /></span><div><strong>{item.offerTitle}</strong><small>{item.code} · Issued {new Date(item.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</small></div><span className={`workspace-activity-status ${item.status}`}>{item.status === "redeemed" ? "Redeemed" : "Unused"}</span>{item.redeemedAt && <time>{new Date(item.redeemedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</time>}</article>)}</div> : <div className="workspace-empty"><span><QrCode size={22} /></span><h3>No redemption activity yet</h3><p>When a customer opens a code for {store.storeName}, it will appear here.</p><button type="button" className="retailer-button retailer-button-primary" onClick={openRedemption}>Enter a customer code <ArrowRight size={15} /></button></div>}</section><p className="workspace-footnote"><strong>Demo data only.</strong> This activity is stored in the current browser session and is not a sales or payment record.</p>
      </div>}

      {section === "profile" && <div className="workspace-content"><div className="workspace-welcome"><div><p className="retailer-eyebrow"><span /> STORE INFORMATION</p><h1>Store profile</h1><p>Review the details customers may use to find your business.</p></div><span className="workspace-ready-badge"><Check size={14} /> PREVIEW READY</span></div><section className="workspace-panel workspace-profile-card"><div className="workspace-profile-avatar"><Storefront size={27} /></div><div className="workspace-profile-main"><h2>{store.storeName}</h2><p>{store.category} <span>·</span> {store.area}, {store.city}</p><div className="workspace-profile-details"><div><small>Address</small><strong>{store.address}</strong></div><div><small>Opening hours</small><strong>{store.hours || "Not added"}</strong></div><div><small>About the store</small><strong>{store.description || "Not added"}</strong></div></div></div></section><p className="workspace-footnote"><strong>Preview only.</strong> Profile details are held for this page session and can’t be published or changed here.</p></div>}
      {section === "account" && <div className="workspace-content"><div className="workspace-welcome"><div><p className="retailer-eyebrow"><span /> ACCOUNT SETTINGS</p><h1>Your account</h1><p>Owner access for your DealSe retailer workspace.</p></div><span className="workspace-ready-badge"><Check size={14} /> SIGNED IN</span></div><section className="workspace-panel workspace-account-card"><div className="workspace-account-avatar"><UserCircle size={30} /></div><div className="workspace-account-main"><span className="workspace-account-label">STORE OWNER</span><h2>{retailerSession?.ownerName || firstName}</h2><p>{retailerSession?.email || ""}</p></div></section><section className="workspace-panel workspace-account-store"><Storefront size={18} /><div><strong>{store.storeName}</strong><span>Owner workspace · {store.city}</span></div><span className="workspace-account-status">RETAILER ACCOUNT</span></section><div className="workspace-signout-row"><p>Your DealSe account is signed in on this device.</p><button type="button" className="workspace-signout-button" onClick={() => onSignOut?.()}><SignOut size={16} /> Sign out</button></div></div>}
    </section>
    {previewingOffer && <div className="detail-wrap workspace-customer-overlay"><button className="back-link" type="button" onClick={() => setPreviewingOffer(null)}>‹ <span>Back to draft review</span></button><section className="offer-detail"><div className="detail-image"><img src={previewingOffer.image} alt={previewingOffer.imageAlt} /><span className="offer-preview-overlay-tag">DRAFT PREVIEW</span></div><div className="detail-copy"><p className="eyebrow">{previewingOffer.category} · {previewingOffer.area}, {previewingOffer.city}</p><span className="detail-offer">{previewingOffer.title}</span><div className="detail-title-row"><h1>{previewingOffer.storeName}</h1></div><p className="detail-subtitle">{previewingOffer.description}</p><hr /><section className="detail-section"><h2>Details About Offer</h2><p>{previewingOffer.description}</p></section><section className="detail-section"><h2>Terms And Conditions</h2><p>{previewingOffer.terms}</p></section><div className="merchant-row"><MapPin size={18} weight="fill" /><span><strong>{previewingOffer.storeName}</strong><small>{previewingOffer.area}, {previewingOffer.city}</small></span></div><p className="workspace-customer-draft-note">This is a customer-page preview. The offer is still a retailer draft and is not live.</p></div></section></div>}
  </main>;
}

function OfferIdeaPicker({ category, prompt, onPromptChange, ideas, loading, message, onAskAi, onUseIdea, onUseStarter }) {
  return <section className="offer-idea-picker" aria-labelledby="offer-idea-title">
    <div className="offer-idea-heading"><div><p className="retailer-eyebrow"><span /> START WITH AN IDEA</p><h2 id="offer-idea-title">Need a starting point?</h2><p>Choose a quick template or get tailored copy for {category.toLowerCase()}.</p></div><span className="offer-idea-badge"><Star size={13} weight="fill" /> Optional AI</span></div>
    <div className="offer-starter-grid">{offerStarters.map((starter) => <button type="button" className="offer-starter-card" key={starter.id} onClick={() => onUseStarter(starter)}><strong>{starter.label}</strong><span>{starter.detail}</span><small>Use this start <ArrowRight size={12} /></small></button>)}</div>
    <div className="offer-ai-box"><label htmlFor="offer-ai-prompt">What do you want to promote? <small>Optional</small><input id="offer-ai-prompt" value={prompt} maxLength={240} placeholder="e.g. our new handloom dupattas" onChange={(event) => onPromptChange(event.target.value)} /></label><button type="button" className="retailer-button retailer-button-primary" onClick={onAskAi} disabled={loading}>{loading ? "Thinking…" : "Get 3 AI ideas"}<Star size={15} weight="fill" /></button></div>
    <p className="offer-ai-privacy">Gemini receives only this category and the note above—not store, contact, or customer details. Free-tier prompts may be used by Google to improve its products; don’t include confidential information.</p>
    {message && <p className="offer-idea-status" role="status">{message}</p>}
    {ideas.length > 0 && <div className="offer-ai-results"><div><h3>Ideas for your store</h3><p>Check the wording and add real offer details before saving.</p></div>{ideas.map((idea, index) => <article className="offer-ai-result" key={`${idea.title}-${index}`}><div><small>IDEA {index + 1}</small><h4>{idea.title}</h4><p>{idea.description}</p><span><strong>Terms to confirm:</strong> {idea.terms}</span>{idea.why && <em>{idea.why}</em>}</div><button type="button" onClick={() => onUseIdea(idea)}>Use idea</button></article>)}</div>}
  </section>;
}

function WorkspaceField({ label, required, error, wide, children }) {
  return <label className={`workspace-field ${wide ? "workspace-field-wide" : ""}`}><span>{label}{required && <b> *</b>}</span>{children}{error && <small className="flow-error">{error}</small>}</label>;
}

function OfferRows({ offers, onEdit }) {
  return <div className="workspace-offer-list">{offers.map((offer) => <article className="workspace-offer-row" key={offer.id}><img className="workspace-offer-thumb" src={offer.image} alt="" /><div><strong>{offer.title}</strong><p>{offer.description}</p><small>{offer.startDate} – {offer.endDate}</small></div><span className="workspace-draft-status">{offer.status}</span><button type="button" onClick={() => onEdit(offer)}>Edit draft</button></article>)}</div>;
}

function CustomerAccountPage({ view, user, savedCount, customerOffers = [], onBack, onSignOut }) {
  const activeOfferCodes = customerOffers.filter((offer) => offer.status === "active");

  if (view === "profile" && user) return <main className="account-page customer-account-page"><div className="account-container"><button type="button" className="account-back" onClick={onBack}>‹ <span>Back to exploring</span></button><div className="account-heading"><p className="eyebrow">YOUR DEALSE ACCOUNT</p><h1>Your profile</h1><p>Your local finds and account details, together.</p></div><section className="account-profile-card"><div className="account-avatar">{user.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</div><div className="account-profile-name"><span className="account-preview-pill">DEALSE ACCOUNT</span><h2>{user.name}</h2><p>{user.email}</p></div><div className="account-stats"><div><strong>{savedCount}</strong><span>Saved offers</span></div><div><strong>{activeOfferCodes.length}</strong><span>Offer codes</span></div></div></section><div className="account-detail-grid"><section className="account-panel"><div><span className="account-panel-icon"><Heart size={19} weight="fill" /></span><div><h2>Saved offers</h2><p>{savedCount ? `You have ${savedCount} offer${savedCount === 1 ? "" : "s"} saved for later.` : "Offers you save will be collected here."}</p></div></div><button type="button" className="account-text-button" onClick={onBack}>Explore local offers <ArrowRight size={15} /></button></section><section className="account-panel"><div><span className="account-panel-icon"><MapPin size={19} weight="fill" /></span><div><h2>Your city</h2><p>Ahmedabad and nearby neighbourhoods</p></div></div><span className="account-static-value">Ahmedabad</span></section></div>{activeOfferCodes.length > 0 && <section className="account-panel account-offer-list"><div><span className="account-panel-icon"><QrCode size={19} /></span><div><h2>Your active offer QR codes</h2><p>{activeOfferCodes.length} code{activeOfferCodes.length === 1 ? "" : "s"} ready to redeem.</p></div></div><div className="account-offer-rows">{activeOfferCodes.slice(0, 3).map((offer) => <div className="account-offer-row" key={offer.code}><strong>{offer.offerTitle}</strong><small>{offer.storeName} · {offer.code}</small></div>)}</div></section>}<div className="account-actions"><p>Manage your account and explore nearby offers.</p><button type="button" className="account-signout" onClick={() => onSignOut?.()}><SignOut size={17} /> Sign out</button></div></div></main>;

  return <main className="account-page customer-account-page"><div className="account-container"><button type="button" className="account-back" onClick={onBack}>‹ <span>Back to exploring</span></button><div className="account-heading"><p className="eyebrow">YOUR DEALSE ACCOUNT</p><h1>Sign in to continue</h1><p>Sign in or create an account to save local offers and manage your finds.</p></div><div className="account-detail-grid"><a className="account-panel account-auth-link" href="/customer/login">Customer sign in <ArrowRight size={15} /></a><a className="account-panel account-auth-link" href="/customer/register">Create a customer account <ArrowRight size={15} /></a></div></div></main>;
}

/**
 * @param {{
 *   mode?: "customer" | "retailer",
 *   initialUser?: { id: string, email: string | null, roles: Array<"customer" | "retailer" | "admin">, profile: { displayName: string | null } } | null,
 *   initialRetailer?: { retailerId: string, id?: string, hasStore?: boolean, storeName: string, ownerName: string, email: string, category: string, categoryId?: string, area: string, city: string, address: string, hours: string, description: string } | null,
 *   initialDeals?: Array<Record<string, any>> | null,
 *   initialCategories?: Array<{ id: string, slug: string, name: string }> | null,
 *   initialSavedDealIds?: string[],
 *   initialActiveDealId?: string,
 *   initialMarketplaceError?: string,
 *   initialStores?: Array<Record<string, any>>,
 *   initialProducts?: Array<Record<string, any>>,
 *   initialRetailerDeals?: Array<Record<string, any>>,
 *   initialNotificationCount?: number,
 *   marketplaceReady?: boolean,
 *   onSearchDeals?: (...args: any[]) => Promise<any[]>,
 *   onToggleFavourite?: (...args: any[]) => Promise<any>,
 *   onReportDeal?: (...args: any[]) => Promise<any>,
 *   onCreateStore?: (...args: any[]) => Promise<any>,
 *   onUpdateStore?: (...args: any[]) => Promise<any>,
 *   onCreateProduct?: (...args: any[]) => Promise<any>,
 *   onUpdateProduct?: (...args: any[]) => Promise<any>,
 *   onArchiveProduct?: (...args: any[]) => Promise<any>,
 *   onCreateDeal?: (...args: any[]) => Promise<any>,
 *   onUpdateDeal?: (...args: any[]) => Promise<any>,
 *   onPublishDeal?: (...args: any[]) => Promise<any>,
 *   onPauseDeal?: (...args: any[]) => Promise<any>,
 *   onPreviewDeal?: (...args: any[]) => Promise<any>,
 *   onCustomerLogout?: () => Promise<void>,
 *   onRetailerLogout?: () => Promise<void>
 * }} props
 */
export function App({ mode = "customer", initialUser = null, initialRetailer = null, initialDeals = null, initialCategories = null, initialSavedDealIds = [], initialActiveDealId = "", initialMarketplaceError = "", initialStores = [], initialProducts = [], initialRetailerDeals = [], initialNotificationCount = 0, marketplaceReady = false, onSearchDeals, onToggleFavourite, onReportDeal, onCreateStore, onUpdateStore, onCreateProduct, onUpdateProduct, onArchiveProduct, onCreateDeal, onUpdateDeal, onPublishDeal, onPauseDeal, onPreviewDeal, onCustomerLogout, onRetailerLogout }) {
  const [city, setCity] = useState("Ahmedabad");
  const [nearbyLocation, setNearbyLocation] = useState(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [sortBy, setSortBy] = useState("newest");
  const pendingNearbySortRef = useRef(false);
  const [category, setCategory] = useState("All");
  const [query, setQuery] = useState("");
  const [saved, setSaved] = useState(() => new Set(initialSavedDealIds));
  const [marketplaceDeals, setMarketplaceDeals] = useState(() => initialDeals ?? demoDeals);
  const [marketplaceLoading, setMarketplaceLoading] = useState(false);
  const [marketplaceError, setMarketplaceError] = useState(initialMarketplaceError);
  const [savingDeals, setSavingDeals] = useState(() => new Set());
  const [activeDeal, setActiveDeal] = useState(() => initialDeals?.find((deal) => deal.id === initialActiveDealId) || null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("inappropriate");
  const [reportDetails, setReportDetails] = useState("");
  const [reportBusy, setReportBusy] = useState(false);
  const [activeStore, setActiveStore] = useState(null);
  const detailCloseRef = useRef(null);
  const detailDialogRef = useRef(null);
  const storeCloseRef = useRef(null);
  const storeDialogRef = useRef(null);
  const [redeem, setRedeem] = useState(null);
  const [redemptions, setRedemptions] = useState([]);
  const [customerOffers, setCustomerOffers] = useState([]);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerResult, setScannerResult] = useState("");
  const [scannerMessage, setScannerMessage] = useState("");
  const [scannerStream, setScannerStream] = useState(null);
  const scannerVideoRef = useRef(null);
  const scannerFileInputRef = useRef(null);
  const [toast, setToast] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState("home");
  const [retailerView, setRetailerView] = useState(mode === "retailer");

  useEffect(() => {
    setReportOpen(false);
    setReportReason("inappropriate");
    setReportDetails("");
  }, [activeDeal?.id]);

  const [retailerWorkspace, setRetailerWorkspace] = useState(initialRetailer);

  const [retailerSession, setRetailerSession] = useState(initialUser ? { ownerName: initialUser.profile.displayName || initialUser.email?.split("@")[0] || "Store owner", email: initialUser.email || "" } : null);
  const [customerAccountPage, setCustomerAccountPage] = useState(null);
  const [customerUser, setCustomerUser] = useState(initialUser?.roles?.includes("customer") ? { id: initialUser.id, name: initialUser.profile.displayName || initialUser.email?.split("@")[0] || "DealSe customer", email: initialUser.email || "" } : null);
  useEffect(() => { document.title = retailerView ? retailerWorkspace ? "Retailer workspace — DealSe" : "DealSe for Stores — Local Business Offers" : customerAccountPage ? "Your DealSe account" : "DealSe — Local Offers Near You"; }, [retailerView, retailerWorkspace, customerAccountPage]);
  useEffect(() => {
    if (!activeDeal && !activeStore) return undefined;
    const previousOverflow = document.body.style.overflow;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") {
        setActiveDeal(null);
        setActiveStore(null);
        setRedeem(null);
        return;
      }
      if (event.key !== "Tab") return;
      const dialog = activeStore ? storeDialogRef.current : detailDialogRef.current;
      const focusable = dialog?.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
      if (!focusable?.length) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    (activeStore ? storeCloseRef : detailCloseRef).current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
      previouslyFocused?.focus();
    };
  }, [activeDeal, activeStore]);
  const deals = [...new Map((marketplaceReady ? marketplaceDeals : demoDeals).map((deal) => [deal.id, deal])).values()];
  const demoCatalogue = marketplaceReady && deals.some((deal) => deal.demoCatalog);
  const categoryOptions = marketplaceReady && Array.isArray(initialCategories)
    ? initialCategories.filter((item) => deals.some((deal) => deal.categoryId === item.id)).map((item) => ({ ...item, short: categories.find((known) => known.name === item.name)?.short ?? item.name, icon: categories.find((known) => known.name === item.name)?.icon ?? ShoppingBag, tint: categories.find((known) => known.name === item.name)?.tint ?? "mint" }))
    : categories;
  const searchMatches = deals.filter((deal) => (category === "All" || deal.category === category) && `${deal.store} ${deal.category} ${deal.offer} ${deal.description} ${deal.area}`.toLowerCase().includes(query.toLowerCase()));
  const byDiscount = (left, right) => discountPercent(right) - discountPercent(left);
  const byRecency = (left, right) => new Date(right.publishedAt || right.createdAt || 0) - new Date(left.publishedAt || left.createdAt || 0);
  const spotlightDeals = diverseDeals(deals, 3, (deal) => deal.store || deal.storeId || deal.category, byDiscount);
  const spotlightIds = new Set(spotlightDeals.map((deal) => deal.id));
  const bestDiscountDeals = diverseDeals(deals.filter((deal) => !spotlightIds.has(deal.id)), 4, (deal) => deal.store || deal.storeId || deal.category, byDiscount);
  const curatedIds = new Set([...spotlightIds, ...bestDiscountDeals.map((deal) => deal.id)]);
  const recentDeals = diverseDeals(deals.filter((deal) => !curatedIds.has(deal.id)), 4, (deal) => deal.store || deal.storeId || deal.title, byRecency);
  const allCuratedIds = new Set([...curatedIds, ...recentDeals.map((deal) => deal.id)]);
  const mobileHeroDeals = diverseDeals(deals.filter((deal) => !allCuratedIds.has(deal.id)), 3, (deal) => deal.store || deal.storeId || deal.title, byDiscount);
  const curatedHomeIds = new Set([...allCuratedIds, ...mobileHeroDeals.map((deal) => deal.id)]);
  const filtered = category === "All" && !query.trim()
    ? searchMatches.filter((deal) => !curatedHomeIds.has(deal.id))
    : searchMatches;
  const storeHighlights = [...deals.reduce((stores, deal) => {
    const storeKey = deal.storeId || deal.store;
    if (!stores.has(storeKey)) stores.set(storeKey, { ...deal, storeId: storeKey, offerCount: 0 });
    stores.get(storeKey).offerCount += 1;
    return stores;
  }, new Map()).values()].sort((left, right) => right.offerCount - left.offerCount || left.store.localeCompare(right.store));
  useEffect(() => {
    if (!marketplaceReady || !onSearchDeals) return;
    let current = true;
    const timeout = window.setTimeout(async () => {
      setMarketplaceLoading(true);
      setMarketplaceError("");
      try {
        const items = await onSearchDeals(query, category, city, nearbyLocation?.latitude, nearbyLocation?.longitude, sortBy);
        if (current) setMarketplaceDeals(items);
      } catch {
        if (current) setMarketplaceError("Offers couldn’t be refreshed. Check your connection and try again.");
      } finally {
        if (current) setMarketplaceLoading(false);
      }
    }, 220);
    return () => { current = false; window.clearTimeout(timeout); };
  }, [marketplaceReady, onSearchDeals, query, category, city, nearbyLocation, sortBy]);
  const notify = (message) => { setToast(message); window.setTimeout(() => setToast(""), 2400); };
  const requestDeviceLocation = () => {
    if (nearbyLocation) {
      setNearbyLocation(null);
      if (sortBy === "nearest") setSortBy("newest");
      notify(`Showing deals in ${city}`);
      return;
    }
    if (!navigator.geolocation) {
      notify("Location is not available in this browser.");
      return;
    }
    setLocationLoading(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setNearbyLocation({ latitude: coords.latitude, longitude: coords.longitude });
        if (pendingNearbySortRef.current) {
          setSortBy("nearest");
          pendingNearbySortRef.current = false;
        }
        setLocationLoading(false);
        notify("Showing active offers within 10 km of you.");
      },
      (error) => {
        pendingNearbySortRef.current = false;
        setLocationLoading(false);
        notify(error.code === error.PERMISSION_DENIED ? "Allow location access to see deals near you." : "Your location could not be found. Try again or browse by city.");
      },
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 10_000 },
    );
  };
  const submitOfferReport = async (event) => {
    event.preventDefault();
    if (!customerUser) {
      window.location.assign("/customer/login");
      return;
    }
    if (!activeDeal?.id || !onReportDeal || reportBusy) return;
    setReportBusy(true);
    try {
      await onReportDeal(activeDeal.id, reportReason, reportDetails);
      setReportOpen(false);
      setReportDetails("");
      notify("Thank you. Your report was sent for review.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Your report could not be submitted. Please try again.");
    } finally {
      setReportBusy(false);
    }
  };
  const toggleSave = async (id) => {
    if (!customerUser) {
      window.location.assign("/customer/login");
      return;
    }
    if (savingDeals.has(id)) return;
    const removing = saved.has(id);
    setSavingDeals((previous) => new Set(previous).add(id));
    try {
      if (marketplaceReady && onToggleFavourite) await onToggleFavourite(id, removing);
      setSaved((previous) => { const next = new Set(previous); removing ? next.delete(id) : next.add(id); return next; });
      notify(removing ? "Removed from your saved deals" : "Saved for later");
    } catch {
      notify("Your saved deals could not be updated. Please try again.");
    } finally {
      setSavingDeals((previous) => { const next = new Set(previous); next.delete(id); return next; });
    }
  };
  const buildQrPayload = (record) => JSON.stringify({
    type: "dealse_offer",
    offerId: record.offerId,
    offerTitle: record.offerTitle,
    storeName: record.storeName,
    customerId: record.userId,
    customerName: record.customerName,
    code: record.code,
    validUntil: record.validUntil,
    issuedAt: record.createdAt,
  });
  const parseQrPayload = (value) => {
    if (!value) return null;
    try {
      const parsed = typeof value === "string" ? JSON.parse(value) : value;
      if (parsed?.type === "dealse_offer" && typeof parsed.code === "string") return parsed;
    } catch {
      return null;
    }
    return null;
  };
  const stopQrScanner = () => {
    setScannerOpen(false);
    setScannerResult("");
    setScannerMessage("");
    if (scannerStream) {
      scannerStream.getTracks().forEach((track) => track.stop());
      setScannerStream(null);
    }
  };
  const openQrScanner = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setScannerMessage("Camera access is not available in this browser. Use the manual code entry or image upload instead.");
      setScannerOpen(false);
      return;
    }
    setScannerOpen(true);
    setScannerResult("");
    setScannerMessage("Point the camera at the customer’s DealSe QR code.");
    try {
      const constraints = {
        video: {
          facingMode: "environment",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints).catch(() => navigator.mediaDevices.getUserMedia({ video: true, audio: false }));
      setScannerStream(stream);
      if (scannerVideoRef.current) {
        const video = scannerVideoRef.current;
        video.srcObject = stream;
        video.muted = true;
        video.playsInline = true;
        video.setAttribute("playsinline", "true");
        await video.play().catch(() => undefined);
      }
    } catch {
      setScannerMessage("Camera access is blocked or unavailable on this device. Use the manual code entry or upload a QR image instead.");
      setScannerOpen(false);
    }
  };
  const readQrFromCamera = async () => {
    if (!scannerVideoRef.current || !scannerVideoRef.current.srcObject) {
      setScannerMessage("The camera stream is not ready yet. Try again in a moment or use the manual code field.");
      return;
    }
    if (!("BarcodeDetector" in window)) {
      setScannerMessage("This browser cannot read QR codes from the camera. Use the manual field or choose a QR image from your device.");
      return;
    }
    try {
      const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
      const barcodes = await detector.detect(scannerVideoRef.current);
      if (!barcodes.length) {
        setScannerMessage("No QR code was detected. Hold the code steady and try again.");
        return;
      }
      const nextValue = String(barcodes[0].rawValue || "").trim();
      if (!nextValue) {
        setScannerMessage("The captured QR code was empty. Try again.");
        return;
      }
      setScannerResult(nextValue);
      setScannerMessage("QR code captured. Apply it to the redemption checker.");
    } catch {
      setScannerMessage("The camera could not read this QR code. Try again or switch to manual entry.");
    }
  };
  const handleScannerImage = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (!("BarcodeDetector" in window)) {
        setScannerMessage("This browser cannot decode QR images directly. Please use the manual code entry instead.");
        event.target.value = "";
        return;
      }
      const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
      const barcodes = await detector.detect(file);
      const nextValue = String(barcodes?.[0]?.rawValue || "").trim();
      if (!nextValue) {
        setScannerMessage("No QR code was found in that image. Try another photo.");
      } else {
        setScannerResult(nextValue);
        setScannerMessage("QR image captured successfully. Apply it to the redemption checker.");
      }
    } catch {
      setScannerMessage("This QR image could not be read. Try another photo or use the manual code entry.");
    } finally {
      event.target.value = "";
    }
  };
  const useScannedCode = () => {
    if (!scannerResult) return;
    setRedemptionCode(scannerResult);
    setRedemptionLookup(null);
    setRedemptionMessage("QR code captured. Check it to confirm the customer offer.");
    stopQrScanner();
  };
  const issueOfferCode = () => {
    if (!activeDeal) return;
    if (!customerUser) {
      window.location.assign("/customer/login");
      return;
    }
    const customer = customerUser;
    const record = {
      code: makePreviewCode(),
      offerId: activeDeal.id,
      offerTitle: activeDeal.title || activeDeal.offer,
      storeName: activeDeal.store,
      category: activeDeal.category,
      area: activeDeal.area,
      city,
      validUntil: activeDeal.valid,
      status: "unused",
      userId: customer.id,
      customerName: customer.name,
      createdAt: new Date().toISOString(),
      qrPayload: "",
    };
    const linkRecord = { ...record, qrPayload: buildQrPayload(record) };
    setRedemptions((current) => [linkRecord, ...current]);
    setCustomerOffers((current) => [{ ...linkRecord, status: "active" }, ...current.filter((item) => item.code !== linkRecord.code)]);
    setRedeem({ ...linkRecord, qrPayload: linkRecord.qrPayload });
  };
  const completeOfferCode = (code) => {
    setRedemptions((current) => current.map((item) => item.code === code && item.status === "unused" ? { ...item, status: "redeemed", redeemedAt: new Date().toISOString() } : item));
    setCustomerOffers((current) => current.filter((item) => item.code !== code));
  };
  const redeemOfferViaApi = async (payload) => {
    const scanned = parseQrPayload(payload.scannedPayload || payload.qrPayload || payload.code);
    const response = await fetch("/api/redeem-offer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: payload.code,
        customerId: payload.userId || payload.customerId || (scanned && scanned.customerId) || "",
        offerId: payload.offerId || (scanned && scanned.offerId) || payload.offerTitle,
        storeName: payload.storeName || store.storeName,
        offerTitle: payload.offerTitle || (scanned && scanned.offerTitle) || payload.offerTitle,
        scannedPayload: payload.scannedPayload || payload.qrPayload || null,
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result?.message || result?.error || "This offer could not be redeemed.");
    }
    return result;
  };
  const copyOfferCode = async () => {
    if (!redeem?.code) return;
    try { await navigator.clipboard.writeText(redeem.code); notify("Offer code copied"); }
    catch { notify("Select the code to copy it"); }
  };
  const scrollTo = (id) => { setMenuOpen(false); document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }); };

  return <div className={`site-shell ${retailerView ? "retailer-view" : ""}`}>
    <header className={`site-header ${retailerWorkspace ? "site-header-hidden" : ""}`}><a className="brand" href="#top" onClick={(e) => { e.preventDefault(); setActiveDeal(null); setRetailerView(false); setCustomerAccountPage(null); }} aria-label="DealSe home"><img src="/assets/dealse-logo.png" alt="" /><span><strong>DealSe</strong><small>Good Local Finds</small></span></a>
      <div className="location-controls"><label className="city-select"><MapPin size={15} weight="fill" /><span className="sr-only">Choose city</span><select value={city} onChange={(e) => { setCity(e.target.value); setNearbyLocation(null); if (sortBy === "nearest") setSortBy("newest"); }}>{cities.map((c) => <option key={c}>{c}</option>)}</select><CaretDown size={12} /></label>{!retailerView && <button className={`location-button${nearbyLocation ? " is-active" : ""}`} type="button" onClick={requestDeviceLocation} disabled={locationLoading} aria-label={nearbyLocation ? "Stop using your location" : "Find deals near me"} aria-pressed={Boolean(nearbyLocation)} title={nearbyLocation ? "Show deals by city" : "Find deals near me"}><MapPin size={16} weight={nearbyLocation ? "fill" : "regular"} /><span className="sr-only">{locationLoading ? "Finding your location" : nearbyLocation ? "Near you" : "Find deals near me"}</span></button>}</div>
      <form className="header-search" onSubmit={(e) => { e.preventDefault(); scrollTo("deals"); }} role="search"><MagnifyingGlass size={17} /><input aria-label="Search stores, products or deals" placeholder={`Search for stores, products or deals in ${city}...`} value={query} onChange={(e) => setQuery(e.target.value)} /></form>
      <nav className={`main-nav ${menuOpen ? "is-open" : ""}`}><button onClick={() => { setRetailerView(false); setCustomerAccountPage(null); setTimeout(() => scrollTo("deals"), 20); }}>Explore</button><button onClick={() => { setRetailerView(false); setCustomerAccountPage(null); setTimeout(() => scrollTo("categories"), 20); }}>Categories</button><button className={retailerView ? "current" : ""} onClick={() => { setRetailerView(true); setCustomerAccountPage(null); setActiveDeal(null); window.scrollTo({ top: 0, behavior: "smooth" }); setMenuOpen(false); }}>For Stores</button><a href={marketplaceReady && customerUser ? "/customer/dashboard" : "/customer/login"}>{marketplaceReady && customerUser ? "Your account" : "Customer sign in"}</a><a href="/retailer/login">Retailer sign in</a></nav>
      <button className="profile-button" type="button" aria-label={retailerView ? (retailerWorkspace || initialUser?.roles?.includes("retailer") ? "Retailer account" : "Retailer sign in") : (customerUser ? "Your profile" : "Customer sign in")} onClick={() => { if (retailerView) { window.location.assign(retailerWorkspace || initialUser?.roles?.includes("retailer") ? "/retailer/dashboard" : "/retailer/login"); } else if (marketplaceReady && customerUser) { window.location.assign("/customer/dashboard"); } else if (customerUser) { setCustomerAccountPage("profile"); window.scrollTo({ top: 0, behavior: "smooth" }); } else { window.location.assign("/customer/login"); } }}><UserCircle size={22} /></button><button className="menu-toggle" type="button" onClick={() => setMenuOpen(!menuOpen)} aria-label={menuOpen ? "Close menu" : "Open menu"}>{menuOpen ? <X size={21} /> : <span>☰</span>}</button>
    </header>

    {customerAccountPage ? <CustomerAccountPage view={customerAccountPage} user={customerUser} savedCount={saved.size} customerOffers={customerOffers} onBack={() => { setCustomerAccountPage(null); setRetailerView(false); window.scrollTo({ top: 0, behavior: "smooth" }); }} onSignOut={() => onCustomerLogout?.()} /> : activeDeal ? (
      <main className="detail-wrap customer-offer-modal" aria-label="Offer details">
        <section ref={detailDialogRef} className="offer-detail" role="dialog" aria-modal="true" aria-labelledby="offer-detail-title" aria-describedby="offer-detail-description" tabIndex={-1}>
          <div className="detail-image">
            <PublicMediaGallery images={activeDeal.images} primaryUrl={activeDeal.image} alt={activeDeal.alt || `Offer at ${activeDeal.store}`} fallback={activeDeal.fallbackImage || "/assets/hero-shopkeeper.png"} variant="deal" badge={activeDeal.offer} />
            <button ref={detailCloseRef} className="detail-close" type="button" onClick={() => { setActiveDeal(null); setRedeem(null); }} aria-label="Back to local deals"><X size={19} aria-hidden="true" /></button>
          </div>
          <div className="detail-copy">
            <p className="eyebrow">{activeDeal.category}</p>
            <div className="detail-title-row">
              <div>
                <h1 id="offer-detail-title">{activeDeal.title || activeDeal.description || activeDeal.store}</h1>
                <p className="detail-store-name"><Storefront size={15} aria-hidden="true" /> {activeDeal.store}</p>
              </div>
              <button type="button" className="share-button" aria-label="Share offer" onClick={() => notify("Offer link copied")}><ShareNetwork size={18} /></button>
            </div>
            <p id="offer-detail-description" className="detail-subtitle">{activeDeal.description}</p>
            {activeDeal.rating && <div className="rating-row"><span aria-label={`${activeDeal.rating} out of 5 stars`}>{[1,2,3,4,5].map((i) => <Star key={i} size={15} weight={i < 5 ? "fill" : "regular"} />)}</span><small>({activeDeal.reviews})</small></div>}
            {(activeDeal.originalPriceMinor || activeDeal.offerPriceMinor) && <div className="detail-prices">{activeDeal.originalPriceMinor && <del>{formatDealPrice(activeDeal.originalPriceMinor)}</del>}{activeDeal.offerPriceMinor && <strong>{formatDealPrice(activeDeal.offerPriceMinor)}</strong>}<span>Offer price</span></div>}
            <div className="detail-validity"><CalendarBlank size={17} aria-hidden="true" /><span><small>Offer validity</small><strong>{formatDealDate(activeDeal.startsAt) || "Available now"}{activeDeal.endsAt || activeDeal.valid ? ` – ${formatDealDate(activeDeal.endsAt || activeDeal.valid)}` : ""}</strong></span></div>
            {activeDeal.descriptionDetails && <section className="detail-section"><h2>About this offer</h2><p>{activeDeal.descriptionDetails}</p></section>}
            {activeDeal.terms && <section className="detail-section"><h2>Terms and conditions</h2><p>{activeDeal.terms}</p></section>}
            <div className="merchant-row"><MapPin size={18} weight="fill" aria-hidden="true" /><span><strong>{activeDeal.store}</strong><small>{formatDealLocation(activeDeal.area, city)}{activeDeal.distance ? ` · ${activeDeal.distance} away` : ""}</small></span></div>
            {onReportDeal && <div className="detail-report-area">{customerUser ? <button className="detail-report-toggle" type="button" aria-expanded={reportOpen} onClick={() => setReportOpen((open) => !open)}>{reportOpen ? "Cancel report" : "Report this offer"}</button> : <a className="detail-report-toggle" href="/customer/login">Sign in to report this offer</a>}
              {reportOpen && customerUser && <form className="detail-report-form" onSubmit={submitOfferReport}><label>What is the issue?<select value={reportReason} onChange={(event) => setReportReason(event.target.value)}><option value="misleading">Misleading details or pricing</option><option value="expired">Offer appears expired</option><option value="inappropriate">Inappropriate content</option><option value="other">Other concern</option></select></label><label>Additional details <span>(optional)</span><textarea value={reportDetails} onChange={(event) => setReportDetails(event.target.value)} maxLength={1000} rows={3} placeholder="Share context to help our team review." /></label><button className="button button--outline" type="submit" disabled={reportBusy}>{reportBusy ? "Sending report…" : "Submit report"}</button></form>}
            </div>}
          </div>
          <div className="detail-actions"><button className="button button--primary" type="button" onClick={issueOfferCode}>Redeem this offer <QrCode size={17} /></button><button className="button button--outline" type="button" onClick={() => toggleSave(activeDeal.id)} aria-pressed={saved.has(activeDeal.id)}><Heart size={16} weight={saved.has(activeDeal.id) ? "fill" : "regular"} /> {saved.has(activeDeal.id) ? "Saved" : "Save offer"}</button>{marketplaceReady && activeDeal.id && activeDeal.slug && <a className="button button--outline" href={`/deals/${encodeURIComponent(activeDeal.id)}/${encodeURIComponent(activeDeal.slug)}`}>Full offer details <ArrowRight size={15} /></a>}</div>
        </section>
      </main>
    ) : retailerView ? retailerWorkspace ? <RetailerWorkspace store={retailerWorkspace} retailerSession={retailerSession} initialStores={initialStores} initialProducts={initialProducts} initialRetailerDeals={initialRetailerDeals} initialCategories={initialCategories || categories} notificationCount={initialNotificationCount} onCreateStore={onCreateStore} onUpdateStore={onUpdateStore} onCreateProduct={onCreateProduct} onUpdateProduct={onUpdateProduct} onArchiveProduct={onArchiveProduct} onCreateDeal={onCreateDeal} onUpdateDeal={onUpdateDeal} onPublishDeal={onPublishDeal} onPauseDeal={onPauseDeal} onPreviewDeal={onPreviewDeal} onSignOut={() => onRetailerLogout?.()} onExit={() => { setRetailerView(false); window.location.assign("/"); }} /> : <RetailerPage onGetStarted={() => window.location.assign(initialUser?.roles?.includes("retailer") ? "/retailer/dashboard" : "/retailer/register")} onLogin={() => window.location.assign(initialUser?.roles?.includes("retailer") ? "/retailer/dashboard" : "/retailer/login")} /> : <main id="top" className="customer-main">
      <section className="hero content-wrap"><div className="hero-copy"><p className="eyebrow">Ahmedabad’s local deals marketplace</p><h1>Good offers<br />from great<br /><em>local stores.</em></h1><p className="hero-intro">Discover independent stores, great offers and unique finds across your neighbourhood.</p><form className="hero-search" onSubmit={(e) => { e.preventDefault(); scrollTo("deals"); }}><label><MapPin size={15} weight="fill" /><span className="sr-only">Choose city</span><select value={city} onChange={(e) => { setCity(e.target.value); setNearbyLocation(null); }}>{cities.map((c) => <option key={c}>{c}</option>)}</select><CaretDown size={12} /></label><MagnifyingGlass size={16} /><input aria-label="Search a local store or offer" placeholder="Search for a store, product or offer" value={query} onChange={(e) => setQuery(e.target.value)} /><button type="submit">Explore deals <ArrowRight size={16} /></button></form></div><div className="hero-collage"><figure className="hero-main-photo"><img src="/assets/hero-shopkeeper.png" alt="A shopkeeper welcoming a customer at a neighborhood store" /></figure><figure className="hero-top-photo"><img src="/assets/hero-textiles.png" alt="A customer browsing textiles in a local boutique" /></figure><div className="hero-note"><span>Local stores</span><strong>Stronger Ahmedabad</strong></div><figure className="hero-bottom-photo"><img src="/assets/deal-garden.png" alt="A local plant shop" /></figure></div>{mobileHeroDeals.length > 0 && <div className="mobile-promo-carousel" role="region" aria-label="Featured local offers">{mobileHeroDeals.map((deal) => <button key={"mobile-hero-"+deal.id} className="mobile-promo-card" type="button" onClick={() => { setActiveDeal(deal); window.scrollTo({ top: 0, behavior: "smooth" }); }}><img src={deal.image} alt={deal.alt || ""} loading="lazy" onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = deal.fallbackImage || "/assets/hero-shopkeeper.png"; }} /><span className="mobile-promo-shade" /><span className="mobile-promo-badge">{deal.offer}</span><span className="mobile-promo-copy"><strong>{deal.title}</strong><small>{deal.store} · {deal.area}</small></span></button>)}</div>}</section>
      {demoCatalogue && <aside className="demo-catalogue-note" aria-label="Demo catalogue notice"><strong>DEMO CATALOGUE</strong><span>These fictional retailers and offers are for product evaluation only.</span></aside>}
      {marketplaceReady && spotlightDeals.length > 0 && <section className="spotlight-section content-wrap" aria-labelledby="spotlight-title"><div className="section-head"><div><p className="eyebrow">Fresh from Ahmedabad</p><h2 id="spotlight-title">Trending deals</h2><p className="section-subtitle">A few good finds to start with</p></div><button className="text-link" type="button" onClick={() => scrollTo("deals")}>Explore all deals <ArrowRight size={14} /></button></div><div className="spotlight-grid">{spotlightDeals.map((deal) => <button className="spotlight-card" key={"spotlight-"+deal.id} type="button" onClick={() => { setActiveDeal(deal); window.scrollTo({ top: 0, behavior: "smooth" }); }}><img src={deal.image} alt={deal.alt} loading="lazy" onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = deal.fallbackImage || "/assets/hero-shopkeeper.png"; }} /><span className="spotlight-shade" /><span className="spotlight-offer">{deal.offer}</span><span className="spotlight-copy"><strong>{deal.title}</strong><small>{deal.store} · {deal.area}</small></span></button>)}</div></section>}
      <section className="categories-band" id="categories"><div className="content-wrap"><div className="section-head compact"><h2>Shop by category</h2><button className="text-link" type="button" onClick={() => setCategory("All")}>View all categories <ArrowRight size={14} /></button></div><div className="category-rail">{categoryOptions.map(({ name, short, icon: Icon, tint }) => <button className={`category-tile ${category === name ? "active" : ""}`} key={name} type="button" onClick={() => setCategory(category === name ? "All" : name)}><span className={`category-icon category-icon--${tint}`}><Icon size={22} /></span><small>{short}</small></button>)}</div></div></section>
      <section className="deals-section content-wrap" id="deals"><div className="section-head"><div><p className="eyebrow">A little closer to home</p><h2>Featured deals near you</h2><p className="section-subtitle">Good finds from independent stores around {city}</p></div><div className="deal-section-actions"><label className="deal-sort-control">Sort by<select aria-label="Sort deals" value={sortBy} onChange={(event) => { const value = event.target.value; if (value === "nearest" && !nearbyLocation) { pendingNearbySortRef.current = true; requestDeviceLocation(); return; } setSortBy(value); }}><option value="newest">Newest</option><option value="discount">Highest % off</option><option value="nearest">Nearest</option></select></label><button className="text-link" type="button" onClick={() => { setCategory("All"); setQuery(""); }}>See all local deals <ArrowRight size={14} /></button></div></div>{marketplaceLoading && <p className="muted" role="status" data-testid="marketplace-loading">Finding local deals…</p>}{marketplaceError && <p className="flow-error" role="alert">{marketplaceError}</p>}{filtered.length ? <div className="deal-grid">{filtered.map((deal) => <DealCard key={deal.id} deal={deal} saved={saved.has(deal.id)} onSave={toggleSave} onOpen={(d) => { setActiveDeal(d); window.scrollTo({ top: 0, behavior: "smooth" }); }} />)}</div> : <div className="empty-state"><Storefront size={28} /><h3>{marketplaceLoading ? "Loading local offers" : marketplaceError ? "Offers are temporarily unavailable" : "No local offers found"}</h3><p>{marketplaceLoading ? "Offers will appear here when they are available." : marketplaceError ? "We couldn’t reach the marketplace just now. Please retry in a moment." : "Try another search or category."}</p>{marketplaceError ? <button type="button" className="button button--outline" onClick={() => window.location.reload()}>Try again</button> : <button type="button" className="button button--outline" onClick={() => { setCategory("All"); setQuery(""); }}>Show all deals</button>}</div>}</section>
      {marketplaceReady && storeHighlights.length > 0 && <section id="store-discovery" className="store-discovery-section content-wrap" aria-labelledby="store-discovery-title"><div className="section-head"><div><p className="eyebrow">Independent neighbourhood businesses</p><h2 id="store-discovery-title">Local stores to discover</h2><p className="section-subtitle">Browse offers from shops around Ahmedabad</p></div></div><div className="store-discovery-rail">{storeHighlights.map((item) => <button className="store-discovery-card" key={"store-"+item.storeId} type="button" onClick={() => { setActiveStore(item); setActiveDeal(null); setCustomerAccountPage(null); setMobileTab("stores"); }}><img src={item.image} alt="" loading="lazy" onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = item.fallbackImage || "/assets/hero-shopkeeper.png"; }} /><span className="store-discovery-content"><strong>{item.store}</strong><small>{item.area} · {item.offerCount} {item.offerCount === 1 ? "offer" : "offers"}</small></span></button>)}</div></section>}
      {marketplaceReady && bestDiscountDeals.length > 0 && <section className="curated-deals-section content-wrap" aria-labelledby="savings-title"><div className="section-head"><div><p className="eyebrow">Make your next find count</p><h2 id="savings-title">Best savings right now</h2><p className="section-subtitle">Offers with the highest listed savings</p></div></div><div className="deal-grid">{bestDiscountDeals.map((deal) => <DealCard key={"saving-"+deal.id} deal={deal} saved={saved.has(deal.id)} onSave={toggleSave} onOpen={(item) => { setActiveDeal(item); window.scrollTo({ top: 0, behavior: "smooth" }); }} />)}</div></section>}
      {marketplaceReady && recentDeals.length > 0 && <section className="curated-deals-section content-wrap" aria-labelledby="recent-title"><div className="section-head"><div><p className="eyebrow">Just added</p><h2 id="recent-title">Recently added offers</h2><p className="section-subtitle">New promotions from local retailers</p></div></div><div className="deal-grid">{recentDeals.map((deal) => <DealCard key={"recent-"+deal.id} deal={deal} saved={saved.has(deal.id)} onSave={toggleSave} onOpen={(item) => { setActiveDeal(item); window.scrollTo({ top: 0, behavior: "smooth" }); }} />)}</div></section>}
      <section className="local-story" id="local-story"><div className="content-wrap local-story-inner"><div><p className="eyebrow">Independent stores. Stronger neighbourhoods.</p><h2>Local shopping<br />builds a <em>brighter city.</em></h2><p>From your favourite café to a hidden home décor gem, discover the people and places that make Ahmedabad special.</p><button className="button button--primary" type="button" onClick={() => scrollTo("deals")}>Explore local deals <ArrowRight size={16} /></button></div><figure><img src="/assets/hero-shopkeeper.png" alt="A local shopkeeper in Ahmedabad" /><figcaption><span>Good local finds</span><strong>Right around the corner.</strong></figcaption></figure></div></section>
      <section className="skyline-section content-wrap" aria-label="Ahmedabad skyline"><img src="/assets/ahmedabad-skyline.png" alt="Ahmedabad skyline — local people, local stores, a brighter Ahmedabad" /></section>
    </main>}

    {!retailerView && !retailerWorkspace && !activeDeal && !activeStore && <nav className="mobile-bottom-nav" aria-label="Customer navigation">
      <button type="button" className={mobileTab === "home" ? "is-active" : ""} aria-current={mobileTab === "home" ? "page" : undefined} onClick={() => { setMobileTab("home"); setCustomerAccountPage(null); window.scrollTo({ top: 0, behavior: "smooth" }); }}><House size={21} weight={mobileTab === "home" ? "fill" : "regular"} /><span>Home</span></button>
      <button type="button" className={mobileTab === "explore" ? "is-active" : ""} aria-current={mobileTab === "explore" ? "page" : undefined} onClick={() => { setMobileTab("explore"); setCustomerAccountPage(null); setRetailerView(false); setTimeout(() => scrollTo("deals"), 20); }}><Compass size={21} weight={mobileTab === "explore" ? "fill" : "regular"} /><span>Explore</span></button>
      <button type="button" className={mobileTab === "saved" ? "is-active" : ""} aria-current={mobileTab === "saved" ? "page" : undefined} onClick={() => { setMobileTab("saved"); window.location.assign(customerUser ? "/customer/dashboard" : "/customer/login"); }}><BookmarkSimple size={21} weight={mobileTab === "saved" ? "fill" : "regular"} /><span>Saved</span></button>
      <button type="button" className={mobileTab === "stores" ? "is-active" : ""} aria-current={mobileTab === "stores" ? "page" : undefined} onClick={() => { setMobileTab("stores"); setCustomerAccountPage(null); setRetailerView(false); setTimeout(() => scrollTo("store-discovery"), 20); }}><Storefront size={21} weight={mobileTab === "stores" ? "fill" : "regular"} /><span>Stores</span></button>
      <button type="button" className={mobileTab === "profile" ? "is-active" : ""} aria-current={mobileTab === "profile" ? "page" : undefined} onClick={() => { setMobileTab("profile"); if (marketplaceReady && customerUser) window.location.assign("/customer/dashboard"); else if (customerUser) { setCustomerAccountPage("profile"); window.scrollTo({ top: 0, behavior: "smooth" }); } else window.location.assign("/customer/login"); }}><UserCircle size={21} weight={mobileTab === "profile" ? "fill" : "regular"} /><span>Profile</span></button>
    </nav>}    <footer className={`site-footer ${retailerWorkspace ? "site-footer-hidden" : ""}`}><div className="content-wrap footer-inner"><a className="brand brand-footer" href="#top" onClick={(e) => { e.preventDefault(); setRetailerView(false); setCustomerAccountPage(null); }}><img src="/assets/dealse-logo.png" alt="" /><span><strong>DealSe</strong><small>Good Local Finds</small></span></a><span>Discover good things close to home.</span><button type="button" onClick={() => { setRetailerView(true); setCustomerAccountPage(null); window.scrollTo({ top: 0, behavior: "smooth" }); }}>For stores <ArrowRight size={13} /></button></div></footer>
    {activeStore && <Dialog title={activeStore.store} close={() => setActiveStore(null)} className="customer-store-dialog" dialogRef={storeDialogRef} closeRef={storeCloseRef}><div className="customer-store-overview"><img src={activeStore.image} alt="" onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = activeStore.fallbackImage || "/assets/hero-shopkeeper.png"; }} /><div><p className="eyebrow">{activeStore.category}</p><p><MapPin size={15} weight="fill" /> {activeStore.area}</p><small>{activeStore.offerCount} current {activeStore.offerCount === 1 ? "offer" : "offers"}</small>{activeStore.storeId && activeStore.storeSlug ? <a className="customer-store-page-link" href={`/stores/${encodeURIComponent(activeStore.storeId)}/${encodeURIComponent(activeStore.storeSlug)}`}>View store profile <ArrowRight size={14} /></a> : null}</div></div><h3>Offers from this store</h3><div className="customer-store-offers">{deals.filter((deal) => deal.storeId ? deal.storeId === activeStore.storeId : deal.store === activeStore.store).map((deal) => <DealCard key={"store-offer-"+deal.id} deal={deal} saved={saved.has(deal.id)} onSave={toggleSave} onOpen={(item) => { setActiveStore(null); setActiveDeal(item); }} />)}</div></Dialog>}
    {redeem && activeDeal && <Dialog title="Your offer code" close={() => setRedeem(null)} className="redeem-dialog"><p>Show this one-time code to the shopkeeper. They’ll check the offer and confirm it at the counter.</p><div className="redeem-code-card"><span>DEALSE PREVIEW CODE</span><strong>{redeem.code}</strong></div><button type="button" className="button button--outline redeem-copy-button" onClick={copyOfferCode}>Copy code</button><div className="redeem-store"><span>{redeem.storeName}</span><strong>{redeem.offerTitle}</strong></div><small className="sample-note">Preview only: this code can be verified in the matching retailer workspace during this page session. No live QR scanner or backend verification is connected.</small></Dialog>}
    {scannerOpen && <Dialog title="Scan customer QR code" close={stopQrScanner} className="qr-scanner-dialog"><div className="qr-scanner-shell"><video ref={scannerVideoRef} className="qr-scanner-video" autoPlay muted playsInline />{scannerMessage && <p className="workspace-redeem-message" role="status">{scannerMessage}</p>}<div className="qr-scanner-actions"><button type="button" className="retailer-button retailer-button-primary" onClick={readQrFromCamera}>Read QR</button><button type="button" className="button button--outline" onClick={() => scannerFileInputRef.current?.click()}>Use QR image</button><button type="button" className="button button--outline" onClick={useScannedCode} disabled={!scannerResult}>Use scanned code</button></div>{scannerResult && <div className="redeem-code-card"><span>CAPTURED CODE</span><strong>{scannerResult}</strong></div>}<input ref={scannerFileInputRef} type="file" accept="image/*" capture="environment" hidden onChange={handleScannerImage} /></div></Dialog>}
    {toast && <div className="toast" role="status"><Check size={16} weight="bold" /> {toast}</div>}
  </div>;
}


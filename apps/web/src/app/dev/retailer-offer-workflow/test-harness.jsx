"use client";

import { useRef, useState } from "react";
import { App } from "../../../../../../prototype/src/App.jsx";

const retailerId = "00000000-0000-4000-8000-000000000001";
const storeId = "00000000-0000-4000-8000-000000000002";
const categoryId = "00000000-0000-4000-8000-000000000003";
const category = { id: categoryId, slug: "fashion", name: "Fashion" };
const store = {
  id: storeId, retailerId, name: "Milestone Textiles", slug: "milestone-textiles", categoryId,
  city: "Ahmedabad", region: "Gujarat", locality: "Navrangpura", addressLine1: "Test Road",
  timezone: "Asia/Kolkata", status: "ACTIVE", verifiedAt: "2026-01-01T00:00:00.000Z", images: [],
};
const retailer = {
  retailerId, id: storeId, hasStore: true, storeName: store.name, ownerName: "Test Retailer",
  email: "retailer@example.invalid", category: category.name, categoryId,
  area: store.locality, city: store.city, address: store.addressLine1, hours: "", description: "Development workflow fixture",
};

function recordFromInput(input, id, current = null) {
  return {
    ...(current || {}), ...input, id, slug: current?.slug || "milestone-offer",
    summary: input.summary === undefined ? current?.summary ?? null : input.summary,
    description: input.details === undefined ? current?.description ?? null : input.details,
    terms: input.terms ?? current?.terms ?? "",
    image: input.imageReference === undefined ? current?.image ?? null : input.imageReference,
    offerType: input.offerType.toLowerCase(), discountBps: input.discountBps ?? current?.discountBps ?? null,
    discountAmountMinor: input.discountAmountMinor ?? current?.discountAmountMinor ?? null,
    currency: input.currency ?? current?.currency ?? null,
    originalPriceMinor: input.originalPriceMinor ?? current?.originalPriceMinor ?? null,
    offerPriceMinor: input.offerPriceMinor ?? current?.offerPriceMinor ?? null,
    startsAt: input.startsAt ?? current?.startsAt, endsAt: input.endsAt ?? current?.endsAt,
    categoryId: input.categoryId ?? current?.categoryId ?? categoryId, category,
    status: current?.status || "draft", publishedAt: current?.publishedAt ?? null,
    store: current?.store || store, products: current?.products || [], images: current?.images || [],
    imageAlt: current?.imageAlt || input.title,
  };
}

export default function RetailerOfferWorkflowHarness() {
  const dealsRef = useRef([]);
  const [deals, setDeals] = useState([]);
  const [events, setEvents] = useState([]);
  const recordEvent = (event) => setEvents((previous) => [...previous, event]);
  const saveList = (next) => { dealsRef.current = next; setDeals(next); };

  const createDeal = async (_retailerId, input) => {
    const created = recordFromInput(input, "00000000-0000-4000-8000-000000000004");
    saveList([created, ...dealsRef.current]);
    recordEvent({ action: "create", input, summary: created.summary, details: created.description });
    return created;
  };
  const updateDeal = async (_retailerId, id, input) => {
    const current = dealsRef.current.find((item) => item.id === id);
    if (!current) throw new Error("Offer not found in development fixture.");
    const updated = recordFromInput(input, id, current);
    saveList(dealsRef.current.map((item) => item.id === id ? updated : item));
    recordEvent({ action: "update", input, summary: updated.summary, details: updated.description });
    return updated;
  };
  const publishDeal = async (_retailerId, id) => {
    const current = dealsRef.current.find((item) => item.id === id);
    if (!current) throw new Error("Offer not found in development fixture.");
    const published = { ...current, status: "published", publishedAt: current.publishedAt || new Date().toISOString() };
    saveList(dealsRef.current.map((item) => item.id === id ? published : item));
    recordEvent({ action: "publish", id, status: published.status });
    return published;
  };

  return <>
    <App
      mode="retailer"
      initialRetailer={retailer}
      initialStores={[store]}
      initialProducts={[]}
      initialRetailerDeals={deals}
      initialCategories={[category]}
      onCreateDeal={createDeal}
      onUpdateDeal={updateDeal}
      onPublishDeal={publishDeal}
      onPreviewDeal={async (_retailerId, id) => dealsRef.current.find((item) => item.id === id)}
      onPauseDeal={async () => ({ status: "paused" })}
    />
    <pre data-testid="offer-workflow-events" hidden>{JSON.stringify(events)}</pre>
  </>;
}

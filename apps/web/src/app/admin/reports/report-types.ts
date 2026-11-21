export type SeriesPoint = { bucket: string; count?: number; created?: number; published?: number; expired?: number; claims?: number; confirmedRedemptions?: number };
export type AnalyticsReport = {
  period: "7d" | "30d" | "90d" | "all";
  timeZone: string;
  range: { from: string | null; to: string; bucket: "day" | "week" | "month" };
  kpis: {
    customers: { total: number; currentPeriod: number; previousPeriod: number | null };
    retailers: { total: number; active: number; currentPeriod: number; previousPeriod: number | null };
    stores: { total: number; verified: number; currentPeriod: number; previousPeriod: number | null };
    offers: { published: number; active: number; expired: number; createdInPeriod: number; publishedInPeriod: number; expiredInPeriod: number; previousCreated: number | null; previousPublished: number | null; previousExpired: number | null };
    claims: { total: number; currentPeriod: number; previousPeriod: number | null };
    redemptions: { total: number; currentPeriod: number; previousPeriod: number | null };
  };
  customerGrowth: SeriesPoint[];
  offerActivity: SeriesPoint[];
  redemptionTrends: SeriesPoint[];
  claimStatuses: { issued: number; redeemed: number; expired: number; revoked: number };
  retailerPerformance: Array<{ id: string; name: string; status: string; redemptions: number; offersCreated: number; offersPublished: number; offersExpired: number }>;
  storePerformance: Array<{ id: string; name: string; city: string; retailerName: string; redemptions: number; offersCreated: number; offersPublished: number; offersExpired: number }>;
  categoryPerformance: Array<{ id: string | null; name: string; offers: number; claims: number; redemptions: number }>;
  offerPerformance: Array<{ id: string; title: string; status: string; storeName: string; retailerName: string; categoryName: string | null; claims: number; redemptions: number }>;
};

import { callDealseApi } from "../../../lib/dealse-api";
import { AdminApiRouteError, AdminMfaRequired, requireAdminRouteContext } from "../route-context";
import { ReportsDashboard } from "./reports-dashboard";
import type { AnalyticsReport } from "./report-types";

export const dynamic = "force-dynamic";
const validPeriods = ["7d", "30d", "90d", "all"] as const;

export default async function AdminReportsPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const { accessToken, mfaRequired } = await requireAdminRouteContext("ANALYTICS_READ");
  if (mfaRequired) return <main className="admin-content"><AdminMfaRequired /></main>;
  const params = await searchParams;
  const period = validPeriods.includes(params.period as (typeof validPeriods)[number]) ? params.period : "30d";
  try {
    const report = await callDealseApi<AnalyticsReport>(`/admin/analytics/reports?period=${period}`, accessToken);
    return <ReportsDashboard report={report} />;
  } catch (error) {
    return <main className="admin-content"><header className="admin-page-heading"><div><span className="admin-eyebrow">Marketplace analytics</span><h1>Reports</h1></div></header><AdminApiRouteError error={error} /></main>;
  }
}

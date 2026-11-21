import { IsIn, IsOptional } from "class-validator";

export const ADMIN_ANALYTICS_PERIODS = ["7d", "30d", "90d", "all"] as const;
export type AdminAnalyticsPeriod = (typeof ADMIN_ANALYTICS_PERIODS)[number];

export class AdminAnalyticsQueryDto {
  @IsOptional() @IsIn(ADMIN_ANALYTICS_PERIODS)
  period: AdminAnalyticsPeriod = "30d";
}

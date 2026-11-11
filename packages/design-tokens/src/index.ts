export const designTokens = {
  color: {
    customer: "#FF4081",
    retailer: "#009688",
    retailerPressed: "#00796B",
    retailerSoft: "#E6F4F2",
    background: "#F8FAFC",
    surface: "#FFFFFF",
    text: "#17202A",
    muted: "#6B7280",
    border: "#E5E7EB",
  },
  spacing: {
    1: 4,
    2: 8,
    3: 12,
    4: 16,
    5: 20,
    6: 24,
    8: 32,
    10: 40,
    12: 48,
    16: 64,
  },
  radius: {
    small: 6,
    medium: 10,
    large: 16,
    pill: 999,
  },
} as const;

export type DesignTokens = typeof designTokens;

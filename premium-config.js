export const BRAND = {
  name: "Grigori",
  signature: "by oryth.io",
  subtitle: "Strategic Intelligence Dashboard",
  fullName: "Grigori by oryth.io",
  pageTitle: "Grigori by oryth.io | Strategic Intelligence Dashboard",
  description: "Real-time geopolitical intelligence, strategic risk monitoring, live situational awareness, and personalized executive reports.",
};

export const REPORT_STATUS_BADGE = "Reports Preview";
export const REPORTS_WIP_COPY = "Personalized intelligence reports are in private preview. This section shows the premium reporting workflow before wider release.";

export const PREMIUM_PLANS = [
  {
    tier: "analyst",
    name: "Analyst",
    priceLabel: "€20 / month",
    reportsPerDay: 1,
    watchlists: 1,
    features: [
      "1 personalized report per day",
      "1 watchlist",
      "Standard report depth",
      "PDF export",
    ],
  },
  {
    tier: "strategic",
    name: "Strategic",
    priceLabel: "€59 / month",
    reportsPerDay: 5,
    watchlists: "Multiple",
    features: [
      "5 personalized reports per day",
      "Multiple watchlists",
      "Advanced report depth",
      "Scenario engine",
      "Priority generation",
      "PDF export",
      "Historical comparisons",
    ],
  },
];

export const REPORT_INPUT_OPTIONS = {
  regions: [
    "Global",
    "Europe / Balkans",
    "Black Sea",
    "Middle East",
    "Red Sea",
    "Strait of Hormuz",
    "Taiwan Strait",
    "Russia / Ukraine",
    "China / South China Sea",
    "Custom",
  ],
  focusAreas: [
    "Military",
    "Political Risk",
    "Elections",
    "Energy",
    "Shipping",
    "Cyber / Infrastructure",
    "Trade / Sanctions",
    "Supply Chains",
    "Technology / Semiconductors",
    "Financial Markets",
    "General Strategic Risk",
  ],
  timeHorizons: ["24 hours", "72 hours", "7 days", "30 days"],
  audienceTypes: ["Executive", "Investor", "Security Team", "Analyst", "General"],
  riskAppetites: ["Conservative", "Balanced", "Aggressive"],
};

export const REPORT_OUTPUT_SECTIONS = [
  "Executive Summary",
  "Key Judgments",
  "Current Situation",
  "What Changed",
  "Trend Analysis",
  "Scenario Matrix",
  "Market Impact",
  "Sector Impact",
  "Watch Indicators",
  "Confidence & Sources",
  "Limitations",
  "Recommended Monitoring Actions",
];

export function getTierConfig(tier = "free") {
  if (tier === "analyst" || tier === "confidential") {
    return PREMIUM_PLANS[0];
  }
  if (tier === "strategic" || tier === "top_secret") {
    return PREMIUM_PLANS[1];
  }
  return {
    tier: "free",
    name: "Free Access",
    priceLabel: "€0",
    reportsPerDay: 0,
    watchlists: 0,
    features: ["Globe UI", "Intel Board", "Daily briefing", "Situational layers"],
  };
}

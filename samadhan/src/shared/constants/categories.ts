export const CATEGORIES = {
  WATER: "water",
  SANITATION: "sanitation",
  ELECTRICITY: "electricity",
  ROADS: "roads",
  PARKS: "parks",
  BUILDINGS: "buildings",
} as const;

export type CategoryType = typeof CATEGORIES[keyof typeof CATEGORIES];

export const CATEGORY_LABELS = {
  [CATEGORIES.WATER]: { en: "Water Supply", hi: "जल आपूर्ति" },
  [CATEGORIES.SANITATION]: { en: "Sanitation", hi: "स्वच्छता" },
  [CATEGORIES.ELECTRICITY]: { en: "Electricity", hi: "बिजली" },
  [CATEGORIES.ROADS]: { en: "Roads", hi: "सड़कें" },
  [CATEGORIES.PARKS]: { en: "Parks & Gardens", hi: "पार्क और बगीचे" },
  [CATEGORIES.BUILDINGS]: { en: "Buildings", hi: "भवन" },
} as const;

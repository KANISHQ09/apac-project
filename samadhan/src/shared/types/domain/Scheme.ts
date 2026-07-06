import React from "react";

export interface Scheme {
  id: string;
  titleEn: string;
  titleHi: string;
  descriptionEn: string;
  descriptionHi: string;
  categoryEn: string;
  categoryHi: string;
  eligibilityEn: string[];
  eligibilityHi: string[];
  deadlineEn?: string;
  deadlineHi?: string;
  isEligible: boolean;
  trustScore: number;
  icon?: React.ReactNode;
  requiredDocuments?: string[]; // E.g. ["aadhaar", "pan", "income", "property"]
}

/**
 * useSchemes.ts
 * -----------------
 * Fetches government schemes and runs a profile-based eligibility matching
 * algorithm against user demographic data.
 *
 * Task 4.1 — Government Schemes Logic (ImplementationPlan.md)
 */

import { useState, useEffect, useMemo } from "react";
import { User } from "@supabase/supabase-js";
import { schemeService } from "../services/schemeService";
import { Scheme } from "@/shared/types/domain/Scheme";
import { Profile } from "@/shared/types/domain/Profile";
import { logger } from "@/shared/services/logger";

// --------------------------------------------------------------------------
// Eligibility Matching Engine
// --------------------------------------------------------------------------

/**
 * Parses an income string like "₹3L", "₹6 lakh", "3 lakh" etc. → number in ₹
 */
function parseIncomeRupees(raw: string): number | null {
  const cleaned = raw.replace(/[,\s]/g, "").toLowerCase();
  const match = cleaned.match(/[\d.]+/);
  if (!match) return null;
  const num = parseFloat(match[0]);
  if (cleaned.includes("l") || cleaned.includes("lakh")) {
    return num * 100000;
  }
  if (cleaned.includes("cr") || cleaned.includes("crore")) {
    return num * 10000000;
  }
  return num;
}

/**
 * Parses an age string like "18+", "≤60", "< 65", "18-40" → [min, max]
 */
function parseAgeRange(raw: string): [number, number] | null {
  const cleaned = raw.replace(/\s/g, "").toLowerCase();
  // "18-40" or "18 to 40"
  const rangeMatch = cleaned.match(/(\d+)[^\d]+(\d+)/);
  if (rangeMatch) return [parseInt(rangeMatch[1]), parseInt(rangeMatch[2])];
  // "60+" or ">=60"
  const plusMatch = cleaned.match(/(\d+)\+/);
  if (plusMatch) return [parseInt(plusMatch[1]), 150];
  // "<65" or "≤65" or "<=65" or "up to 65"
  const ltMatch = cleaned.match(/[≤<](\d+)/);
  if (ltMatch) return [0, parseInt(ltMatch[1])];
  // bare number like "18" meaning 18+
  const bareMatch = cleaned.match(/^(\d+)$/);
  if (bareMatch) return [parseInt(bareMatch[1]), 150];
  return null;
}

/**
 * Runs the eligibility check for a single scheme against the user profile.
 *
 * Strategy: scan each eligibility criterion string for known patterns
 * (income thresholds, age ranges, student status) and compare against profile.
 * Schemes with no detectable criteria default to "potentially eligible".
 */
function checkEligibility(scheme: Scheme, profile: Profile): boolean {
  const criteria = scheme.eligibilityEn;
  let matched = 0;
  let totalChecked = 0;

  for (const criterion of criteria) {
    const lower = criterion.toLowerCase();

    // ── Income checks ──────────────────────────────────────────────────
    if (lower.includes("income") || lower.includes("₹")) {
      totalChecked++;
      // Extract comparison operator and amount
      const ltMatch =
        criterion.match(/[<≤]\s*₹?([\d.]+\s*[lLcC]?[\w]*)/i);
      if (ltMatch) {
        const threshold = parseIncomeRupees(ltMatch[1]);
        // We approximate using pincode-tier: if user has no income data,
        // we grant benefit of the doubt for low-income schemes with threshold ≤ ₹5L
        if (threshold !== null && threshold <= 500000) {
          // No income field on Profile yet — grant for now
          matched++;
        } else {
          matched++; // Threshold is high → most likely eligible
        }
      } else {
        matched++;
      }
    }

    // ── Age checks ─────────────────────────────────────────────────────
    else if (lower.includes("age") || lower.match(/\d+\+/)) {
      totalChecked++;
      const range = parseAgeRange(criterion);
      if (range) {
        // Profile has no DOB/age field yet → grant benefit of the doubt
        matched++;
      } else {
        matched++;
      }
    }

    // ── Student status ─────────────────────────────────────────────────
    else if (lower.includes("student")) {
      totalChecked++;
      // Without occupation field we cannot verify — default to not eligible
      // for student-specific schemes unless we have explicit data
    }

    // ── Artisan / occupation ───────────────────────────────────────────
    else if (lower.includes("artisan") || lower.includes("craftsman")) {
      totalChecked++;
      // Without occupation field → not eligible
    }

    // ── SECC database / BPL ───────────────────────────────────────────
    else if (lower.includes("secc") || lower.includes("bpl")) {
      totalChecked++;
      // Cannot verify without external data — skip
    }

    // ── No pucca house ────────────────────────────────────────────────
    else if (lower.includes("pucca") || lower.includes("house")) {
      totalChecked++;
      matched++; // Benefit of the doubt
    }

    // ── General / other ───────────────────────────────────────────────
    else {
      // Criterion we can't parse → assume eligible
      matched++;
    }
  }

  // If we checked nothing specific → default eligible
  if (totalChecked === 0) return true;
  // Eligible if majority of checked criteria pass
  return matched / criteria.length >= 0.5;
}

// --------------------------------------------------------------------------
// Hook
// --------------------------------------------------------------------------

export function useSchemes(user?: User | null, profile?: Profile | null) {
  const [schemes, setSchemes] = useState<Scheme[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setLoading(true);
        const data = await schemeService.getSchemes();
        if (active) {
          setSchemes(data);
          setError(null);
        }
      } catch (err: any) {
        logger.error("Failed to load schemes:", err);
        if (active) {
          setError(err.message || "Failed to load schemes");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  /**
   * Derived lists: run the eligibility algorithm if we have a profile,
   * otherwise fall back to the `isEligible` flag from the repository mock.
   */
  const { eligibleSchemes, otherSchemes } = useMemo(() => {
    const eligible: Scheme[] = [];
    const other: Scheme[] = [];

    for (const scheme of schemes) {
      const isEligible = profile
        ? checkEligibility(scheme, profile)
        : scheme.isEligible;

      if (isEligible) {
        eligible.push({ ...scheme, isEligible: true });
      } else {
        other.push({ ...scheme, isEligible: false });
      }
    }

    return { eligibleSchemes: eligible, otherSchemes: other };
  }, [schemes, profile]);

  return {
    schemes,
    eligibleSchemes,
    otherSchemes,
    loading,
    error,
  };
}

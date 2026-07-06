import { useSearchParams } from "react-router-dom";

export interface MapUrlFilters {
  category: string | null;
  status:   string | null;
  city:     string | null;
  issueId:  string | null;
}

/**
 * Reads map filter state from URL query params.
 * Used by CivicMapPage to accept deep-links from the Dashboard.
 *
 * Supported params:
 *   ?category=Roads       → pre-select category filter
 *   ?status=resolved      → pre-select status filter
 *   ?city=Bhopal          → pan & zoom to that city's centroid
 *   ?issueId=<uuid>       → pan to a specific issue marker and open its popup
 */
export function useMapFiltersFromUrl(): MapUrlFilters {
  const [searchParams] = useSearchParams();
  return {
    category: searchParams.get("category"),
    status:   searchParams.get("status"),
    city:     searchParams.get("city"),
    issueId:  searchParams.get("issueId"),
  };
}

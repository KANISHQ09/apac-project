import { useState, useEffect, useRef, useMemo } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { issueService } from "@/features/issues/services/issueService";
import { aiInsightService } from "@/features/issues/services/aiInsightService";
import { issueVerificationService } from "@/features/issues/services/issueVerificationService";
import { Issue } from "@/shared/types/domain/Issue";
import { IssueStatus } from "@/shared/types/domain/IssueStatus";
import { useLanguage } from "@/app/providers/LanguageProvider";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { useMapFiltersFromUrl } from "../hooks/useMapFiltersFromUrl";
import {
  MapPin,
  Filter,
  BarChart3,
  AlertTriangle,
  CheckCircle2,
  Timer,
  Droplets,
  Trash2,
  Zap,
  Construction,
  TreePine,
  Building2,
  X,
  Loader2,
  TrendingUp,
  ChevronRight,
  Activity,
  Search,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Fix Leaflet's broken default icon paths when bundled with Vite
// ---------------------------------------------------------------------------
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

// ---------------------------------------------------------------------------
// Status colours
// ---------------------------------------------------------------------------
const STATUS_COLORS: Record<string, string> = {
  [IssueStatus.REPORTED]:    "#f59e0b",
  [IssueStatus.IN_PROGRESS]: "#3b82f6",
  [IssueStatus.RESOLVED]:    "#22c55e",
  [IssueStatus.REJECTED]:    "#ef4444",
};

function makeIcon(color: string): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div style="
      width:26px;height:26px;border-radius:50% 50% 50% 0;
      background:${color};border:3px solid white;
      transform:rotate(-45deg);
      box-shadow:0 2px 8px rgba(0,0,0,0.35);
    "></div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 26],
    popupAnchor: [0, -28],
  });
}

// ---------------------------------------------------------------------------
// Category meta & normalizer
// ---------------------------------------------------------------------------
const CATEGORY_META: Record<string, { icon: React.ReactNode; color: string; hi: string }> = {
  "Water Supply":    { icon: <Droplets className="w-3.5 h-3.5" />, color: "#3b82f6", hi: "जल आपूर्ति" },
  "जल आपूर्ति":     { icon: <Droplets className="w-3.5 h-3.5" />, color: "#3b82f6", hi: "जल आपूर्ति" },
  "Sanitation":      { icon: <Trash2 className="w-3.5 h-3.5" />,   color: "#f59e0b", hi: "स्वच्छता" },
  "स्वच्छता":       { icon: <Trash2 className="w-3.5 h-3.5" />,   color: "#f59e0b", hi: "स्वच्छता" },
  "Electricity":     { icon: <Zap className="w-3.5 h-3.5" />,      color: "#eab308", hi: "बिजली" },
  "बिजली":          { icon: <Zap className="w-3.5 h-3.5" />,      color: "#eab308", hi: "बिजली" },
  "Roads":           { icon: <Construction className="w-3.5 h-3.5" />, color: "#6b7280", hi: "सड़कें" },
  "सड़कें":         { icon: <Construction className="w-3.5 h-3.5" />, color: "#6b7280", hi: "सड़कें" },
  "Parks & Gardens": { icon: <TreePine className="w-3.5 h-3.5" />,  color: "#22c55e", hi: "पार्क और बगीचे" },
  "पार्क और बगीचे": { icon: <TreePine className="w-3.5 h-3.5" />,  color: "#22c55e", hi: "पार्क और बगीचे" },
  "Buildings":       { icon: <Building2 className="w-3.5 h-3.5" />, color: "#8b5cf6", hi: "भवन" },
  "भवन":            { icon: <Building2 className="w-3.5 h-3.5" />, color: "#8b5cf6", hi: "भवन" },
};

const CATEGORY_DISPLAY_NAMES = [
  "Water Supply", "Sanitation", "Electricity", "Roads", "Parks & Gardens", "Buildings",
];
const STATUS_DISPLAY = [IssueStatus.REPORTED, IssueStatus.IN_PROGRESS, IssueStatus.RESOLVED];

const STATUS_LABELS_MAP: Record<string, { en: string; hi: string }> = {
  [IssueStatus.REPORTED]:    { en: "Reported",    hi: "रिपोर्ट" },
  [IssueStatus.IN_PROGRESS]: { en: "In Progress", hi: "प्रगति में" },
  [IssueStatus.RESOLVED]:    { en: "Resolved",    hi: "हल" },
  [IssueStatus.REJECTED]:    { en: "Rejected",    hi: "अस्वीकृत" },
};

const CANONICAL_CATEGORIES: Record<string, string> = {
  "water": "Water Supply",
  "watersupply": "Water Supply",
  "water supply": "Water Supply",
  "sanitation": "Sanitation",
  "garbage": "Sanitation",
  "trash": "Sanitation",
  "waste": "Sanitation",
  "electricity": "Electricity",
  "electric": "Electricity",
  "power": "Electricity",
  "road": "Roads",
  "roads": "Roads",
  "building": "Buildings",
  "buildings": "Buildings",
  "park": "Parks & Gardens",
  "parks": "Parks & Gardens",
  "garden": "Parks & Gardens",
  "gardens": "Parks & Gardens",
  "parks & gardens": "Parks & Gardens",
  "parks and gardens": "Parks & Gardens",
  "जल आपूर्ति": "Water Supply",
  "स्वच्छता": "Sanitation",
  "बिजली": "Electricity",
  "सड़कें": "Roads",
  "पार्क और बगीचे": "Parks & Gardens",
  "भवन": "Buildings"
};

function normalizeCategory(cat: string): string {
  if (!cat) return "";
  let normalized = cat.trim().toLowerCase();
  
  if (CANONICAL_CATEGORIES[normalized]) {
    return CANONICAL_CATEGORIES[normalized];
  }
  
  if (normalized.endsWith("s") && normalized.length > 2) {
    normalized = normalized.slice(0, -1);
  }
  
  if (CANONICAL_CATEGORIES[normalized]) {
    return CANONICAL_CATEGORIES[normalized];
  }
  
  return cat;
}

// ---------------------------------------------------------------------------
// Robust City Extraction Utility & Hardcoded Centroids for Fallback
// ---------------------------------------------------------------------------
const KNOWN_CITIES = [
  { key: "bhopal", name: "Bhopal" },
  { key: "khanna", name: "Khanna" },
  { key: "indore", name: "Indore" },
  { key: "mumbai", name: "Mumbai" },
  { key: "delhi", name: "Delhi" },
  { key: "new delhi", name: "New Delhi" },
  { key: "bangalore", name: "Bengaluru" },
  { key: "bengaluru", name: "Bengaluru" },
  { key: "hyderabad", name: "Hyderabad" },
  { key: "chennai", name: "Chennai" },
  { key: "kolkata", name: "Kolkata" },
  { key: "pune", name: "Pune" }
];

const CITY_COORDS: Record<string, [number, number]> = {
  bhopal: [23.2599, 77.4126],
  khanna: [30.7022, 76.2163],
  indore: [22.7196, 75.8577],
  mumbai: [19.0760, 72.8777],
  delhi: [28.6139, 77.2090],
  "new delhi": [28.6139, 77.2090],
  bangalore: [12.9716, 77.5946],
  bengaluru: [12.9716, 77.5946],
  hyderabad: [17.3850, 78.4867],
  chennai: [13.0827, 80.2707],
  kolkata: [22.5726, 88.3639],
  pune: [18.5204, 73.8567],
};

const STATE_COUNTRY_BLACKLIST = new Set([
  "india", "usa", "united states",
  "madhya pradesh", "mp", "m.p.", "punjab", "maharashtra", "delhi", "haryana",
  "uttar pradesh", "up", "u.p.", "gujarat", "rajasthan", "karnataka", "tamil nadu",
  "kerala", "andhra pradesh", "telangana", "west bengal", "bihar", "jharkhand",
  "odisha", "chhattisgarh", "himachal pradesh", "uttarakhand", "goa", "assam"
]);

const STREET_INDICATORS = /\b(st|street|rd|road|lane|ln|plot|ward|flat|sector|building|house|h\.no|no|floor|near|opp|behind|post office|post|office|park)\b/i;

function extractCity(location: string): string {
  if (!location) return "Unknown";
  
  const lowerLocation = location.toLowerCase();
  
  // 1. Check for known cities in the text
  for (const city of KNOWN_CITIES) {
    const regex = new RegExp(`\\b${city.key}\\b`, "i");
    if (regex.test(lowerLocation)) {
      return city.name;
    }
  }

  // 2. Comma-separated analysis
  const parts = location.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return "Unknown";

  for (const part of parts) {
    const partLower = part.toLowerCase();
    
    // Skip blacklist items
    if (STATE_COUNTRY_BLACKLIST.has(partLower)) continue;
    
    // Skip pincodes
    if (/^\d{6}$/.test(partLower)) continue;
    
    // Skip specific street addresses
    if (/\d/.test(partLower) || STREET_INDICATORS.test(partLower)) continue;
    
    // If it looks like a clean name of length >= 3, return it capitalized
    if (part.length >= 3) {
      return part.charAt(0).toUpperCase() + part.slice(1);
    }
  }

  // Fallback 1: Return the first part that is not country/state
  for (const part of parts) {
    const partLower = part.toLowerCase();
    if (!STATE_COUNTRY_BLACKLIST.has(partLower)) {
      return part;
    }
  }

  // Fallback 2: Return first part
  return parts[0] || "Unknown";
}

// ---------------------------------------------------------------------------
// Popup Generator
// ---------------------------------------------------------------------------
function buildPopupHtml(issue: Issue, language: "en" | "hi"): string {
  const statusColor = STATUS_COLORS[issue.status] ?? "#6b7280";
  const catColor = CATEGORY_META[issue.category as string]?.color ?? "#6b7280";
  const statusLabel = STATUS_LABELS_MAP[issue.status]?.[language] ?? issue.status;
  const dateStr = new Date(issue.createdAt).toLocaleDateString(
    language === "hi" ? "hi-IN" : "en-IN",
    { year: "numeric", month: "short", day: "numeric" }
  );

  // Synchronous rule-based getSyncInsight() for popup details to avoid Gemini network requests
  const insight = aiInsightService.getSyncInsight(issue);

  // Fetch community verification data using the unified getComputedState helper
  const { confirmations, disagreements, confidence, isVerified } = 
    issueVerificationService.getComputedState(issue.id, issue.title);

  const verificationBadgeHtml = isVerified
    ? `<span style="
        display: inline-flex; align-items: center; gap: 4px;
        padding: 2px 8px; border-radius: 9999px; font-size: 11px; font-weight: 700;
        color: #22c55e; border: 1.5px solid rgba(34, 197, 94, 0.35);
        background: rgba(34, 197, 94, 0.1);
      ">✓ Verified</span>`
    : "";
  
  const severityColors = {
    low: "#22c55e",
    medium: "#eab308",
    high: "#f97316",
    critical: "#ef4444",
  };
  const severityLabels = {
    low: { en: "Low", hi: "निम्न" },
    medium: { en: "Medium", hi: "मध्यम" },
    high: { en: "High", hi: "उच्च" },
    critical: { en: "Critical", hi: "गंभीर" },
  };

  const severityColor = severityColors[insight.severity] ?? "#6b7280";
  const severityLabel = severityLabels[insight.severity]?.[language] ?? insight.severity;

  const viewDetailsLabel = language === "en" ? "View Details" : "विवरण देखें";
  const supportCountLabel = language === "en" ? "supports" : "समर्थन";

  const thumbnailHtml = issue.imageUrls && issue.imageUrls.length > 0 
    ? `<div style="width: 100%; height: 95px; margin-bottom: 8px; border-radius: 8px; overflow: hidden; background: #eee;">
         <img src="${issue.imageUrls[0]}" style="width: 100%; height: 100%; object-fit: cover;" />
       </div>`
    : "";

  return `
    <div style="font-family: inherit; min-width: 220px; max-width: 260px; padding: 2px;">
      ${thumbnailHtml}
      
      <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 8px;">
        <span style="
          display: inline-flex; align-items: center; gap: 4px;
          padding: 2px 8px; border-radius: 9999px; font-size: 11px; font-weight: 600;
          background: ${catColor}; color: white;
        ">${issue.category as string}</span>
        <span style="
          display: inline-flex; align-items: center; gap: 4px;
          padding: 2px 8px; border-radius: 9999px; font-size: 11px; font-weight: 600;
          color: ${statusColor};
          border: 1.5px solid ${statusColor}55;
          background: ${statusColor}18;
        ">
          <span style="width: 6px; height: 6px; border-radius: 50%; background: ${statusColor}; display: inline-block;"></span>
          ${statusLabel}
        </span>
        ${verificationBadgeHtml}
      </div>
      
      <p style="font-weight: 700; font-size: 13px; margin: 0 0 6px; line-height: 1.35; color: inherit;">
        ${issue.title}
      </p>
      
      <div style="
        background: rgba(99,102,241,0.06);
        border: 1px solid rgba(99,102,241,0.15);
        border-radius: 8px;
        padding: 6px 8px;
        margin-bottom: 8px;
        font-size: 10.5px;
      ">
        <div style="display: flex; justify-content: space-between; margin-bottom: 4px; align-items: center;">
          <span style="color: #666; font-weight: 600;">🤖 AI Severity:</span>
          <span style="color: ${severityColor}; font-weight: 700; font-size: 10.5px;">${severityLabel}</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 4px; align-items: center;">
          <span style="color: #666; font-weight: 600;">👥 Confidence:</span>
          <span style="color: #333; font-weight: 700;">${confidence}% (${confirmations} vs ${disagreements})</span>
        </div>
        <div style="display: flex; flex-direction: column;">
          <span style="color: #666; font-weight: 600; margin-bottom: 2px;">🏢 Department:</span>
          <span style="color: #333; font-weight: 700;">${insight.department}</span>
        </div>
      </div>

      ${issue.description ? `
        <p style="font-size: 11px; color: #666; margin: 0 0 6px; line-height: 1.45;
          overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">
          ${issue.description}
        </p>
      ` : ""}
      ${issue.location ? `
        <p style="font-size: 10.5px; color: #888; margin: 0 0 6px; display: flex; align-items: center; gap: 4px;">
          📍 ${issue.location}
        </p>
      ` : ""}
      
      <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 8px; padding-top: 8px; border-top: 1px solid #eee; font-size: 11px;">
        <span style="color: #666; display: inline-flex; align-items: center; gap: 3px;">
          👍 ${issue.supportsCount} ${supportCountLabel}
        </span>
        <a href="/dashboard?issueId=${issue.id}" style="color: #3b82f6; text-decoration: none; font-weight: 600; font-family: inherit;" target="_blank">
          ${viewDetailsLabel} ↗
        </a>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------
export default function CivicMapPage() {
  const { language } = useLanguage();
  const urlFilters = useMapFiltersFromUrl();

  // Map state and layer refs
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const [mapInstance, setMapInstance] = useState<L.Map | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const markersMapRef = useRef<Map<string, L.Marker>>(new Map());
  const [verificationVersion, setVerificationVersion] = useState(0);

  useEffect(() => {
    const handleSync = () => {
      setVerificationVersion((v) => v + 1);
    };
    window.addEventListener("issue_verifications_changed", handleSync);
    return () => window.removeEventListener("issue_verifications_changed", handleSync);
  }, []);

  // Data
  const [allIssues, setAllIssues] = useState<Issue[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]); // geotagged only
  const [loading, setLoading] = useState(true);
  const [userPos, setUserPos] = useState<[number, number] | null>(null);
  const [autoOpenId, setAutoOpenId] = useState<string | null>(null);
  const [urlParamsProcessed, setUrlParamsProcessed] = useState(false);
  const [markersInitialized, setMarkersInitialized] = useState(false);

  // UI / Search / Filters
  const [categoryFilters, setCategoryFilters] = useState<Set<string>>(new Set());
  const [statusFilters, setStatusFilters] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showPanel, setShowPanel] = useState(true);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Close search dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setShowSearchDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // -- Initialise Leaflet map (once) ----------------------------------------
  useEffect(() => {
    if (!mapContainerRef.current || mapInstance) return;

    const map = L.map(mapContainerRef.current, {
      center: [20.5937, 78.9629], // India default
      zoom: 5,
      zoomControl: true,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    const layerGroup = L.layerGroup().addTo(map);
    setMapInstance(map);
    markersRef.current = layerGroup;

    return () => {
      map.remove();
      setMapInstance(null);
      markersRef.current = null;
    };
  }, []);

  // -- Fetch all issues from Supabase -------------------------------------------
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const mapped = await issueService.fetchAllIssuesForMap();
        if (!cancelled) {
          setAllIssues(mapped);
          setIssues(mapped.filter((i) => i.latitude !== null && i.longitude !== null));
        }
      } catch (err) {
        console.error("Failed to load map issues:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // -- Silently get user location (once) -------------------------------------
  useEffect(() => {
    if (typeof window === "undefined" || !navigator.geolocation || !mapInstance) return;
    
    let active = true;

    // Inspect search parameters on load
    const searchParams = new URLSearchParams(window.location.search);
    const hasCityParam = searchParams.get("city") || urlFilters.city;
    const hasIssueIdParam = searchParams.get("issueId") || urlFilters.issueId;
    
    // Abort geolocation fly-to/centering completely if a deep link is present
    if (hasCityParam || hasIssueIdParam) return;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (!active) return;

        // Double check deep link parameters in case they were set in the meantime
        const currentParams = new URLSearchParams(window.location.search);
        if (currentParams.get("city") || currentParams.get("issueId") || urlFilters.city || urlFilters.issueId) return;

        const coords: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        setUserPos(coords);
        mapInstance.setView(coords, 12, { animate: true });
      },
      () => { /* silently ignore */ },
      { enableHighAccuracy: false, timeout: 5000 }
    );

    return () => {
      active = false;
    };
  }, [mapInstance, urlFilters.city, urlFilters.issueId]);

  // -- Add pulsing user marker when userPos resolves -------------------------
  useEffect(() => {
    if (!mapInstance || !userPos) return;

    if (userMarkerRef.current) {
      mapInstance.removeLayer(userMarkerRef.current);
    }

    const userMarker = L.marker(userPos, {
      icon: L.divIcon({
        className: "",
        html: `<div class="user-location-pulse"></div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      })
    });

    userMarker.bindPopup(`
      <div style="font-family:inherit;text-align:center;padding:4px;min-width:100px;">
        <p style="font-weight:700;font-size:12px;margin:0 0 2px;">${language === "en" ? "You Are Here" : "आप यहाँ हैं"}</p>
        <p style="font-size:10px;color:#666;margin:0;">${language === "en" ? "Current Location" : "वर्तमान स्थान"}</p>
      </div>
    `);

    userMarker.addTo(mapInstance);
    userMarkerRef.current = userMarker;

    return () => {
      if (userMarkerRef.current) {
        mapInstance.removeLayer(userMarkerRef.current);
      }
    };
  }, [userPos, language, mapInstance]);

  // -- Process URL deep link params once map AND markers are fully ready -------
  useEffect(() => {
    if (!mapInstance || !markersInitialized || urlParamsProcessed) return;

    let targetZoomPos: [number, number] | null = null;
    let targetZoomLevel = 12;
    let autoOpenIssueId: string | null = null;

    if (urlFilters.category) {
      const normalizedQueryCat = normalizeCategory(urlFilters.category);
      const match = CATEGORY_DISPLAY_NAMES.find(c => normalizeCategory(c) === normalizedQueryCat);
      if (match) {
        setCategoryFilters(new Set([match]));
      } else {
        setCategoryFilters(new Set([urlFilters.category]));
      }
      setShowFilters(true);
    }

    if (urlFilters.status) {
      setStatusFilters(new Set([urlFilters.status]));
      setShowFilters(true);
    }

    if (urlFilters.city) {
      const normalizedTargetCity = urlFilters.city.trim().toLowerCase();
      const cityIssues = allIssues.filter(
        (i) => extractCity(i.location).toLowerCase() === normalizedTargetCity
      );
      const coordIssues = cityIssues.filter(
        (i) => i.latitude !== null && i.latitude !== undefined && i.longitude !== null && i.longitude !== undefined
      );

      if (coordIssues.length > 0) {
        const sumLat = coordIssues.reduce((sum, i) => sum + Number(i.latitude), 0);
        const sumLng = coordIssues.reduce((sum, i) => sum + Number(i.longitude), 0);
        const avgLat = sumLat / coordIssues.length;
        const avgLng = sumLng / coordIssues.length;
        targetZoomPos = [avgLat, avgLng];
        targetZoomLevel = 11;
        console.log(`Deep Link Centroid calculated for ${normalizedTargetCity} (${coordIssues.length} issues): [${avgLat}, ${avgLng}]`);
      } else if (CITY_COORDS[normalizedTargetCity]) {
        targetZoomPos = CITY_COORDS[normalizedTargetCity];
        targetZoomLevel = 11;
        console.log(`Deep Link Fallback to coordinates table for ${normalizedTargetCity}:`, targetZoomPos);
      }
    }

    if (urlFilters.issueId) {
      const targetIssue = allIssues.find((i) => i.id === urlFilters.issueId);
      if (targetIssue && targetIssue.latitude && targetIssue.longitude) {
        targetZoomPos = [targetIssue.latitude, targetIssue.longitude];
        targetZoomLevel = 15;
        autoOpenIssueId = targetIssue.id;
      }
    }

    if (targetZoomPos) {
      mapInstance.invalidateSize();
      mapInstance.flyTo(targetZoomPos, targetZoomLevel, { animate: true, duration: 1.5 });
      if (autoOpenIssueId) {
        setAutoOpenId(autoOpenIssueId);
      }
    }

    setUrlParamsProcessed(true);
  }, [allIssues, markersInitialized, urlFilters, urlParamsProcessed, mapInstance]);

  // -- Filtered issues -------------------------------------------------------
  const filtered = useMemo(() => {
    return issues.filter((issue) => {
      // 1. Normalized Category Filter Matching
      let catMatch = true;
      if (categoryFilters.size > 0) {
        const normalizedIssueCat = normalizeCategory(issue.category as string);
        catMatch = Array.from(categoryFilters).some((fc) => {
          const normalizedFilterCat = normalizeCategory(fc);
          return normalizedIssueCat === normalizedFilterCat;
        });
      }

      // 2. Status Filter Matching
      const statusMatch =
        statusFilters.size === 0 || statusFilters.has(issue.status);

      // 3. Search Query Matching (for realtime filter, when not choosing specific dropdown result)
      const query = searchQuery.toLowerCase();
      const titleMatch = !searchQuery || issue.title.toLowerCase().includes(query);
      const descMatch = !searchQuery || issue.description.toLowerCase().includes(query);
      const cityMatch = !searchQuery || extractCity(issue.location).toLowerCase().includes(query);
      const categoryTextMatch = !searchQuery || (issue.category as string).toLowerCase().includes(query);

      return catMatch && statusMatch && (titleMatch || descMatch || cityMatch || categoryTextMatch);
    });
  }, [issues, categoryFilters, statusFilters, searchQuery]);

  // -- Search results dropdown calculations --------------------------------
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const query = searchQuery.toLowerCase();
    return allIssues.filter((issue) => {
      const titleMatch = issue.title.toLowerCase().includes(query);
      const descMatch = issue.description.toLowerCase().includes(query);
      const cityMatch = extractCity(issue.location).toLowerCase().includes(query);
      const catMatch = (issue.category as string).toLowerCase().includes(query);
      return titleMatch || descMatch || cityMatch || catMatch;
    }).slice(0, 6);
  }, [allIssues, searchQuery]);

  const handleSelectSearchResult = (issue: Issue) => {
    if (!mapInstance) return;

    let targetPos: [number, number] | null = null;
    let targetZoom = 15;

    if (issue.latitude && issue.longitude) {
      targetPos = [issue.latitude, issue.longitude];
    } else {
      // Fallback to city centroid
      const city = extractCity(issue.location).toLowerCase();
      if (CITY_COORDS[city]) {
        targetPos = CITY_COORDS[city];
        targetZoom = 12;
      }
    }

    if (targetPos) {
      mapInstance.invalidateSize();
      mapInstance.flyTo(targetPos, targetZoom, { animate: true, duration: 1.5 });
      
      const marker = markersMapRef.current.get(issue.id);
      if (marker) {
        setTimeout(() => {
          marker.openPopup();
          
          // Swap highlight animation
          const originalIcon = marker.options.icon;
          const highlightIcon = L.divIcon({
            className: "",
            html: `<div style="
              width:36px;height:36px;border-radius:50% 50% 50% 0;
              background:#ef4444;border:4px solid white;
              transform:rotate(-45deg);
              box-shadow:0 0 20px #ef4444, 0 0 40px #ef4444;
              transition: all 0.3s ease;
            "></div>`,
            iconSize: [36, 36],
            iconAnchor: [18, 36],
            popupAnchor: [0, -38],
          });
          
          marker.setIcon(highlightIcon);
          setTimeout(() => {
            if (marker) {
              marker.setIcon(originalIcon);
            }
          }, 3000);
        }, 1500);
      }
    }
    
    setShowSearchDropdown(false);
    setSearchQuery("");
  };

  // -- Sync markers to filtered list ----------------------------------------
  useEffect(() => {
    const lg = markersRef.current;
    if (!lg) return;

    lg.clearLayers();
    markersMapRef.current.clear();

    filtered.forEach((issue) => {
      if (!issue.latitude || !issue.longitude) return;
      const color = STATUS_COLORS[issue.status] ?? STATUS_COLORS[IssueStatus.REPORTED];
      const marker = L.marker([issue.latitude, issue.longitude], { icon: makeIcon(color) });
      marker.bindPopup(buildPopupHtml(issue, language), { maxWidth: 280 });
      lg.addLayer(marker);
      markersMapRef.current.set(issue.id, marker);
    });

    if (autoOpenId && markersMapRef.current.has(autoOpenId)) {
      const marker = markersMapRef.current.get(autoOpenId);
      marker?.openPopup();
      setAutoOpenId(null);
    }
    
    setMarkersInitialized(true);
  }, [filtered, language, autoOpenId]);

  // -- Update marker popups reactively when verification votes change -------
  useEffect(() => {
    markersMapRef.current.forEach((marker, issueId) => {
      const issue = allIssues.find((i) => i.id === issueId);
      if (issue && typeof marker.setPopupContent === "function") {
        marker.setPopupContent(buildPopupHtml(issue, language));
      }
    });
  }, [verificationVersion, language, allIssues]);

  // -- Trigger map resize when panel width changes ---------------------------
  useEffect(() => {
    const timer = setTimeout(() => {
      mapInstance?.invalidateSize();
    }, 320);
    return () => clearTimeout(timer);
  }, [showPanel, mapInstance]);

  // -- Advanced Analytics ----------------------------------------------------
  const analytics = useMemo(() => {
    const cityMap: Record<string, Issue[]> = {};
    issues.forEach((issue) => {
      const city = extractCity(issue.location);
      if (!cityMap[city]) cityMap[city] = [];
      cityMap[city].push(issue);
    });

    const topCities = Object.entries(cityMap)
      .map(([city, list]) => {
        const catCount: Record<string, number> = {};
        list.forEach((i) => {
          const c = i.category as string;
          catCount[c] = (catCount[c] || 0) + 1;
        });
        const topCat = Object.entries(catCount).sort((a, b) => b[1] - a[1])[0];
        return {
          city,
          count: list.length,
          topCategory: topCat?.[0] ?? "—",
          resolvedCount: list.filter((i) => i.status === IssueStatus.RESOLVED).length,
        };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const overallCatCount: Record<string, number> = {};
    allIssues.forEach((i) => {
      const c = i.category as string;
      overallCatCount[c] = (overallCatCount[c] || 0) + 1;
    });
    const topOverallCat = Object.entries(overallCatCount).sort((a, b) => b[1] - a[1])[0];

    const statusCount = {
      reported:   allIssues.filter((i) => i.status === IssueStatus.REPORTED).length,
      inProgress: allIssues.filter((i) => i.status === IssueStatus.IN_PROGRESS).length,
      resolved:   allIssues.filter((i) => i.status === IssueStatus.RESOLVED).length,
    };

    // Calculate GPS Coverage
    const gpsCoverage = allIssues.length > 0
      ? Math.round((issues.length / allIssues.length) * 100)
      : 0;

    // Calculate Average Resolution Time
    const resolvedIssues = allIssues.filter(
      (i) => i.status === IssueStatus.RESOLVED && i.updatedAt && i.createdAt
    );
    const avgResolutionHrs = resolvedIssues.length > 0
      ? resolvedIssues.reduce((sum, i) => {
          const diffMs = i.updatedAt!.getTime() - i.createdAt.getTime();
          return sum + diffMs / (1000 * 60 * 60);
        }, 0) / resolvedIssues.length
      : 0;

    const formattedAvgTime = avgResolutionHrs > 0
      ? avgResolutionHrs < 24
        ? `${Math.round(avgResolutionHrs)} hrs`
        : `${Math.round(avgResolutionHrs / 24)} days`
      : (language === "en" ? "No resolved issues yet" : "कोई हल मुद्दा नहीं");

    // Duplicate warnings / Merges count
    const duplicateCount = allIssues.filter((i) => i.masterIssueId !== null).length;

    // Category distribution bar list
    const catDistribution = Object.entries(overallCatCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4);

    return {
      topCities,
      topOverallCat,
      statusCount,
      gpsCoverage,
      formattedAvgTime,
      duplicateCount,
      catDistribution,
    };
  }, [allIssues, issues, language]);

  const activeFiltersCount = categoryFilters.size + statusFilters.size;

  const toggleCategory = (cat: string) => {
    setCategoryFilters((prev) => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  };

  const toggleStatus = (s: string) => {
    setStatusFilters((prev) => {
      const next = new Set(prev);
      next.has(s) ? next.delete(s) : next.add(s);
      return next;
    });
  };

  return (
    <div className="relative flex overflow-hidden" style={{ height: "calc(100vh - 64px)" }}>
      {/* Dynamic pulse CSS injection */}
      <style>{`
        @keyframes leaflet-pulsing {
          0% { transform: scale(0.8); opacity: 1; }
          70% { transform: scale(1.6); opacity: 0; }
          100% { transform: scale(0.8); opacity: 0; }
        }
        .user-location-pulse {
          width: 16px;
          height: 16px;
          background: #3b82f6;
          border: 3.5px solid white;
          border-radius: 50%;
          box-shadow: 0 0 12px rgba(59, 130, 246, 0.7);
          position: relative;
        }
        .user-location-pulse::after {
          content: '';
          position: absolute;
          top: -7px;
          left: -7px;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          border: 3.5px solid #3b82f6;
          animation: leaflet-pulsing 2s infinite ease-out;
        }
      `}</style>

      {/* ------------------------------------------------------------------ */}
      {/* Civic Intelligence Side Panel                                        */}
      {/* ------------------------------------------------------------------ */}
      <aside
        className="relative z-[500] h-full bg-card border-r border-border overflow-y-auto shrink-0 transition-all duration-300 shadow-xl"
        style={{ width: showPanel ? "340px" : "0px", overflow: showPanel ? "auto" : "hidden" }}
      >
        {showPanel && (
          <div className="p-4 space-y-5">
            {/* Panel Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                  <BarChart3 className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="font-bold text-sm text-foreground">
                    {language === "en" ? "Civic Intelligence" : "नागरिक इंटेलिजेंस"}
                  </h2>
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <span>🤖</span>
                    {language === "en" ? "Powered by Gemini" : "जेमिनी द्वारा संचालित"}
                  </p>
                </div>
              </div>
              <Button variant="ghost" size="iconSm" onClick={() => setShowPanel(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>

            {/* Coverage and Resolution Metrics Grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-primary/5 rounded-xl p-3 border border-primary/10">
                <p className="text-xs text-muted-foreground font-semibold">
                  {language === "en" ? "GPS Coverage" : "जीपीएस कवरेज"}
                </p>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-xl font-extrabold text-primary">{analytics.gpsCoverage}%</span>
                </div>
                <div className="w-full bg-muted h-1 rounded-full mt-2 overflow-hidden">
                  <div className="bg-primary h-full rounded-full" style={{ width: `${analytics.gpsCoverage}%` }} />
                </div>
              </div>

              <div className="bg-accent/5 rounded-xl p-3 border border-accent/10">
                <p className="text-xs text-muted-foreground font-semibold">
                  {language === "en" ? "Avg Resolution" : "औसत समाधान"}
                </p>
                <p className="text-xs font-bold text-accent mt-1 leading-tight">{analytics.formattedAvgTime}</p>
                <p className="text-[9px] text-muted-foreground mt-2 flex items-center gap-1">
                  <Timer className="w-2.5 h-2.5" />
                  {language === "en" ? "For resolved issues" : "हल की गई समस्याओं के लिए"}
                </p>
              </div>
            </div>

            {/* Status counts */}
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-amber-500/10 rounded-xl p-2 text-center border border-amber-500/15">
                <p className="text-lg font-bold text-amber-500">{analytics.statusCount.reported}</p>
                <p className="text-[9px] text-muted-foreground">
                  {language === "en" ? "Reported" : "रिपोर्ट"}
                </p>
              </div>
              <div className="bg-blue-500/10 rounded-xl p-2 text-center border border-blue-500/15">
                <p className="text-lg font-bold text-blue-500">{analytics.statusCount.inProgress}</p>
                <p className="text-[9px] text-muted-foreground">
                  {language === "en" ? "In Progress" : "प्रगति में"}
                </p>
              </div>
              <div className="bg-green-500/10 rounded-xl p-2 text-center border border-green-500/15">
                <p className="text-lg font-bold text-green-500">{analytics.statusCount.resolved}</p>
                <p className="text-[9px] text-muted-foreground">
                  {language === "en" ? "Resolved" : "हल"}
                </p>
              </div>
            </div>

            {/* Duplicate counts */}
            {analytics.duplicateCount > 0 && (
              <div className="bg-destructive/5 rounded-xl p-3 border border-destructive/15 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-destructive" />
                  <span className="text-xs font-semibold text-destructive">
                    {language === "en" ? "Duplicate Issues Prevented" : "रोके गए डुप्लिकेट मुद्दे"}
                  </span>
                </div>
                <Badge variant="destructive" className="font-bold text-xs">{analytics.duplicateCount}</Badge>
              </div>
            )}

            {/* Category breakdown progress bars */}
            <div className="space-y-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                {language === "en" ? "Category Split" : "श्रेणी विभाजन"}
              </p>
              <div className="space-y-2.5">
                {analytics.catDistribution.map(([cat, count]) => {
                  const pct = allIssues.length > 0 ? (count / allIssues.length) * 100 : 0;
                  const meta = CATEGORY_META[cat];
                  return (
                    <div key={cat} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5 text-muted-foreground font-medium">
                          <span style={{ color: meta?.color }}>{meta?.icon ?? <AlertTriangle className="w-3 h-3" />}</span>
                          {language === "hi" && meta?.hi ? meta.hi : cat}
                        </span>
                        <span className="font-semibold text-foreground">{count}</span>
                      </div>
                      <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${pct}%`, backgroundColor: meta?.color || "var(--primary)" }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Divider */}
            <div className="flex items-center gap-2 pt-2">
              <div className="flex-1 h-px bg-border" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold shrink-0">
                {language === "en" ? "Top Affected Cities" : "प्रभावित शहर"}
              </span>
              <div className="flex-1 h-px bg-border" />
            </div>

            {/* Top affected cities list */}
            {loading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
              </div>
            ) : analytics.topCities.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">
                {language === "en"
                  ? "No geo-tagged issues yet."
                  : "अभी कोई जियो-टैग समस्या नहीं।"}
              </p>
            ) : (
              <div className="space-y-2">
                {analytics.topCities.map((entry, idx) => (
                  <div
                    key={entry.city}
                    className="flex items-center gap-3 p-2.5 rounded-xl bg-muted/30 border border-border/40 hover:bg-muted/50 cursor-pointer hover:border-primary/20 transition-all duration-200"
                    onClick={() => {
                      const cityIssues = issues.filter(
                        (i) => extractCity(i.location).toLowerCase() === entry.city.toLowerCase()
                      );
                      if (cityIssues.length > 0 && mapInstance) {
                        const avgLat = cityIssues.reduce((sum, i) => sum + i.latitude!, 0) / cityIssues.length;
                        const avgLng = cityIssues.reduce((sum, i) => sum + i.longitude!, 0) / cityIssues.length;
                        mapInstance.setView([avgLat, avgLng], 12, { animate: true });
                      }
                    }}
                  >
                    <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{entry.city}</p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className="text-primary shrink-0">
                          {CATEGORY_META[entry.topCategory]?.icon ?? <AlertTriangle className="w-3 h-3" />}
                        </span>
                        <p className="text-[10px] text-muted-foreground truncate">{entry.topCategory}</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-foreground">{entry.count}</p>
                      <p className="text-[10px] text-green-500">{entry.resolvedCount} ✓</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Total pin counts */}
            <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 flex items-center gap-3">
              <Activity className="w-4 h-4 text-primary shrink-0" />
              <p className="text-xs text-muted-foreground">
                {language === "en"
                  ? `${issues.length} geo-tagged issues displayed`
                  : `${issues.length} जियो-टैग समस्याएं प्रदर्शित`}
              </p>
            </div>
          </div>
        )}
      </aside>

      {/* ------------------------------------------------------------------ */}
      {/* Map + Overlay Controls                                               */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex-1 relative flex flex-col">
        
        {/* Floating Google-Maps-Style Search Bar Overlay (Top Center) */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1010] w-full max-w-md px-4 pointer-events-none">
          <div ref={searchContainerRef} className="pointer-events-auto bg-card/95 backdrop-blur-md border border-border rounded-2xl p-3 shadow-2xl flex flex-col gap-2">
            
            {/* Search Input Box + Filters Toggle */}
            <div className="relative flex items-center gap-2">
              <div className="flex items-center gap-2 bg-muted/60 border border-border/80 rounded-xl px-3 py-2 flex-1">
                <Search className="w-4 h-4 text-muted-foreground shrink-0" />
                <input
                  type="text"
                  placeholder={language === "en" ? "Search issues, cities, categories..." : "समस्याएं, शहर खोजें..."}
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setShowSearchDropdown(true);
                  }}
                  onFocus={() => setShowSearchDropdown(true)}
                  className="bg-transparent border-none text-xs text-foreground focus:outline-none w-full"
                />
                {searchQuery && (
                  <button onClick={() => { setSearchQuery(""); setShowSearchDropdown(false); }} className="text-muted-foreground hover:text-foreground">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              
              <button
                className={`flex items-center justify-center p-2.5 rounded-xl border transition-all relative ${
                  showFilters || activeFiltersCount > 0
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-muted hover:bg-muted/80 text-muted-foreground border-border"
                }`}
                onClick={() => setShowFilters((v) => !v)}
                title={language === "en" ? "Filters" : "फ़िल्टर"}
              >
                <Filter className="w-4 h-4" />
                {activeFiltersCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground rounded-full text-[9px] px-1 font-bold">
                    {activeFiltersCount}
                  </span>
                )}
              </button>
            </div>

            {/* Search Results Dropdown List */}
            {showSearchDropdown && searchQuery && searchResults.length > 0 && (
              <div className="absolute top-full left-4 right-4 mt-1 bg-card border border-border rounded-xl shadow-2xl z-[1000] max-h-60 overflow-y-auto p-1 divide-y divide-border/40">
                {searchResults.map((issue) => (
                  <button
                    key={issue.id}
                    onClick={() => handleSelectSearchResult(issue)}
                    className="w-full text-left px-3 py-2 hover:bg-muted/60 transition-colors flex flex-col gap-0.5 rounded-lg text-xs"
                  >
                    <span className="font-semibold text-foreground truncate">{issue.title}</span>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span className="font-medium text-primary/80">{issue.category}</span>
                      <span>•</span>
                      <span>{extractCity(issue.location)}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Horizontal Scroll Category Chips Inside Search Bar */}
            <div className="flex items-center gap-1.5 overflow-x-auto py-1 max-w-full scrollbar-none scroll-smooth">
              {CATEGORY_DISPLAY_NAMES.map((cat) => {
                const meta = CATEGORY_META[cat];
                const active = categoryFilters.has(cat);
                return (
                  <button
                    key={cat}
                    onClick={() => toggleCategory(cat)}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10.5px] font-semibold whitespace-nowrap transition-all border ${
                      active
                        ? "border-primary bg-primary text-primary-foreground border-primary"
                        : "border-border bg-muted/40 text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    <span style={{ color: active ? "white" : meta?.color }}>{meta?.icon}</span>
                    {language === "hi" && meta?.hi ? meta.hi : cat}
                  </button>
                );
              })}
            </div>

          </div>
        </div>

        {/* Floating Title & Live Status (Top Right) */}
        <div className="absolute top-4 right-4 z-[400] pointer-events-none flex flex-col items-end gap-2">
          <div className="pointer-events-auto bg-card/90 backdrop-blur-md border border-border rounded-xl px-3 py-1.5 flex items-center gap-2 shadow-lg">
            <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
            <span className="text-xs font-bold text-foreground">
              {language === "en" ? "Civic Map" : "नागरिक मानचित्र"}
            </span>
            {!loading && (
              <div className="flex items-center gap-1">
                <Badge variant="secondary" className="text-[10px] px-1 py-0 font-medium">
                  {filtered.length}
                </Badge>
                <span className="relative flex h-1.5 w-1.5 ml-1">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500"></span>
                </span>
                <span className="text-[9px] text-green-500 font-bold uppercase tracking-wider animate-pulse">
                  {language === "en" ? "Live" : "लाइव"}
                </span>
              </div>
            )}
          </div>

          {!showPanel && (
            <button
              className="pointer-events-auto bg-card border border-border rounded-lg px-2.5 py-1.5 flex items-center gap-1.5 shadow hover:bg-muted transition-colors text-xs font-semibold text-foreground"
              onClick={() => setShowPanel(true)}
            >
              <BarChart3 className="w-3.5 h-3.5 text-primary" />
              {language === "en" ? "Insights" : "जानकारी"}
            </button>
          )}
        </div>

        {/* Filter overlay panel */}
        {showFilters && (
          <div className="absolute top-36 left-3 right-3 z-[400] bg-card/95 backdrop-blur-xl border border-border rounded-2xl shadow-2xl p-4 space-y-4">
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                {language === "en" ? "Category" : "श्रेणी"}
              </p>
              <div className="flex flex-wrap gap-2">
                {CATEGORY_DISPLAY_NAMES.map((cat) => {
                  const meta = CATEGORY_META[cat];
                  const active = categoryFilters.has(cat);
                  return (
                    <button
                      key={cat}
                      onClick={() => toggleCategory(cat)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                        active
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-muted/50 text-muted-foreground hover:border-primary/50"
                      }`}
                    >
                      <span style={{ color: meta?.color }}>{meta?.icon}</span>
                      {language === "hi" && meta?.hi ? meta.hi : cat}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                {language === "en" ? "Status" : "स्थिति"}
              </p>
              <div className="flex flex-wrap gap-2">
                {STATUS_DISPLAY.map((s) => {
                  const active = statusFilters.has(s);
                  return (
                    <button
                      key={s}
                      onClick={() => toggleStatus(s)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                        active
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-muted/50 text-muted-foreground hover:border-primary/50"
                      }`}
                    >
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: STATUS_COLORS[s] }}
                      />
                      {STATUS_LABELS_MAP[s]?.[language] ?? s}
                    </button>
                  );
                })}
              </div>
            </div>

            {activeFiltersCount > 0 && (
              <button
                className="text-xs text-destructive hover:underline"
                onClick={() => { setCategoryFilters(new Set()); setStatusFilters(new Set()); setSearchQuery(""); }}
              >
                {language === "en" ? "Clear all filters" : "सभी फ़िल्टर हटाएं"}
              </button>
            )}
          </div>
        )}

        {/* Loading spinner */}
        {loading && (
          <div className="absolute inset-0 z-[300] flex items-center justify-center bg-background/60 backdrop-blur-sm">
            <div className="bg-card rounded-2xl p-6 flex flex-col items-center gap-3 shadow-xl border border-border">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">
                {language === "en" ? "Loading civic data…" : "नागरिक डेटा लोड हो रहा है…"}
              </p>
            </div>
          </div>
        )}

        {/* Leaflet map DOM target */}
        <div ref={mapContainerRef} className="w-full h-full" />

        {/* Empty matches indicator */}
        {!loading && filtered.length === 0 && (
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-[400] bg-card/95 backdrop-blur-xl border border-border rounded-2xl px-5 py-3 shadow-xl flex items-center gap-3">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
            <p className="text-sm text-muted-foreground">
              {language === "en"
                ? "No matching geo-tagged issues found."
                : "कोई मेल खाती हुई जियो-टैग समस्या नहीं मिली।"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

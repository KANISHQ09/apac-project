import { useState, useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Badge } from "@/shared/components/ui/badge";
import { MapPin, Search, Loader2, Compass } from "lucide-react";
import { logger } from "@/shared/services/logger";

// Standard default leaflet icons fix
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

// Module-level caches to survive component remounts
const geocodeCache: Record<string, any[]> = {};
const reverseGeocodeCache: Record<string, string> = {};

function makeBounceIcon(color: string): L.DivIcon {
  return L.divIcon({
    className: "custom-leaflet-marker-wrapper",
    html: `
      <div class="marker-pin-bounce" style="display: flex; flex-direction: column; align-items: center; justify-content: center; position: relative;">
        <!-- Pulse shadow ring -->
        <div class="marker-pulse" style="position: absolute; bottom: -2px; width: 14px; height: 6px; background: rgba(0,0,0,0.25); border-radius: 50%; filter: blur(1px); z-index: -1;"></div>
        <!-- Pin icon -->
        <svg width="34" height="34" viewBox="0 0 24 24" fill="${color}" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="animate-marker-drop" style="filter: drop-shadow(0px 3px 5px rgba(0,0,0,0.3)); transform: translateY(-16px); transform-origin: bottom center;">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
          <circle cx="12" cy="10" r="3" fill="white"></circle>
        </svg>
      </div>
    `,
    iconSize: [32, 48],
    iconAnchor: [16, 48],
    popupAnchor: [0, -48],
  });
}

interface LocationPickerProps {
  location: string;
  latitude: number | null;
  longitude: number | null;
  onChange: (location: string, lat: number | null, lng: number | null) => void;
  geocodeStatus: "idle" | "resolving" | "success" | "failed";
  setGeocodeStatus: (status: "idle" | "resolving" | "success" | "failed") => void;
  language: "en" | "hi";
}

export default function LocationPicker({
  location,
  latitude,
  longitude,
  onChange,
  geocodeStatus,
  setGeocodeStatus,
  language,
}: LocationPickerProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const [mapInstance, setMapInstance] = useState<L.Map | null>(null);
  const [markerInstance, setMarkerInstance] = useState<L.Marker | null>(null);

  // Search autocomplete states
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Loading indicator states
  const [isLocating, setIsLocating] = useState(false);
  const [isReverseGeocoding, setIsReverseGeocoding] = useState(false);
  const [isMapMoving, setIsMapMoving] = useState(false);

  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Close search suggestions on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // -- Initialize Map Instance --
  useEffect(() => {
    if (!mapContainerRef.current || mapInstance) return;

    const initialCenter: L.LatLngExpression =
      latitude !== null && longitude !== null
        ? [latitude, longitude]
        : [20.5937, 78.9629]; // default to India center
    const initialZoom = latitude !== null && longitude !== null ? 15 : 5;

    const map = L.map(mapContainerRef.current, {
      center: initialCenter,
      zoom: initialZoom,
      zoomControl: true,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    setMapInstance(map);

    // Click map to place/move marker
    map.on("click", async (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;
      await handleMapClick(lat, lng);
    });

    // Toggle center crosshair overlay during movement
    map.on("movestart", () => setIsMapMoving(true));
    map.on("moveend", () => setIsMapMoving(false));

    return () => {
      map.remove();
      setMapInstance(null);
    };
  }, []);

  // -- Synchronize parent coordinates to Map Marker --
  useEffect(() => {
    if (!mapInstance) return;

    if (latitude !== null && longitude !== null) {
      const pos: L.LatLngExpression = [latitude, longitude];

      if (markerInstance) {
        markerInstance.setLatLng(pos);
      } else {
        const marker = L.marker(pos, {
          draggable: true,
          icon: makeBounceIcon("#ef4444"),
        });

        // Listen to marker drag events
        marker.on("dragend", async (e) => {
          const latlng = e.target.getLatLng();
          await handleMapClick(latlng.lat, latlng.lng);
        });

        marker.addTo(mapInstance);
        setMarkerInstance(marker);
      }
    } else {
      if (markerInstance) {
        mapInstance.removeLayer(markerInstance);
        setMarkerInstance(null);
      }
    }
  }, [latitude, longitude, mapInstance]);

  // -- Geocoding suggestions fetching (debounced) --
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSuggestions([]);
      return;
    }

    const delayTimer = setTimeout(async () => {
      setIsSearching(true);
      const queryKey = searchQuery.trim().toLowerCase();

      if (geocodeCache[queryKey]) {
        setSuggestions(geocodeCache[queryKey]);
        setIsSearching(false);
        return;
      }

      try {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
          searchQuery
        )}&format=json&limit=5`;
        const res = await fetch(url, {
          headers: {
            "User-Agent": "SamadhanCivicIntelligencePlatform/1.0",
          },
        });
        if (res.ok) {
          const data = await res.json();
          geocodeCache[queryKey] = data;
          setSuggestions(data);
        }
      } catch (err) {
        logger.error("Suggestion fetch failed:", err);
      } finally {
        setIsSearching(false);
      }
    }, 800); // 800ms debounce

    return () => clearTimeout(delayTimer);
  }, [searchQuery]);

  // -- Reverse geocoder --
  const reverseGeocode = async (lat: number, lon: number): Promise<string> => {
    const cacheKey = `${lat.toFixed(6)},${lon.toFixed(6)}`;
    if (reverseGeocodeCache[cacheKey]) {
      return reverseGeocodeCache[cacheKey];
    }

    try {
      const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`;
      const res = await fetch(url, {
        headers: {
          "User-Agent": "SamadhanCivicIntelligencePlatform/1.0",
        },
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.display_name) {
          reverseGeocodeCache[cacheKey] = data.display_name;
          return data.display_name;
        }
      }
    } catch (err) {
      logger.error("Reverse geocode failed:", err);
    }
    return language === "en" ? "Selected Location" : "चयनित स्थान";
  };

  // -- Event handlers --
  const handleMapClick = async (lat: number, lng: number) => {
    setIsReverseGeocoding(true);
    setGeocodeStatus("resolving");
    try {
      const address = await reverseGeocode(lat, lng);
      onChange(address, lat, lng);
      setGeocodeStatus("success");
    } catch (err) {
      onChange(location || "Selected Location", lat, lng);
      setGeocodeStatus("failed");
    } finally {
      setIsReverseGeocoding(false);
    }
  };

  const handleSelectSuggestion = async (item: any) => {
    const lat = parseFloat(item.lat);
    const lon = parseFloat(item.lon);
    const address = item.display_name;

    setShowSuggestions(false);
    setSearchQuery("");

    if (mapInstance) {
      mapInstance.invalidateSize();
      mapInstance.flyTo([lat, lon], 15, { animate: true, duration: 1.5 });
    }

    onChange(address, lat, lon);
    setGeocodeStatus("success");
  };

  const handleUseCurrentLocation = () => {
    if (typeof window === "undefined" || !navigator.geolocation) {
      return;
    }

    setIsLocating(true);
    setGeocodeStatus("resolving");

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;

        if (mapInstance) {
          mapInstance.invalidateSize();
          mapInstance.flyTo([lat, lon], 15, { animate: true, duration: 1.5 });
        }

        const address = await reverseGeocode(lat, lon);
        onChange(address, lat, lon);
        setGeocodeStatus("success");
        setIsLocating(false);
      },
      (err) => {
        logger.error("GPS location capture failed:", err);
        setGeocodeStatus("failed");
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  // Extract primary name and secondary address from Nominatim display_name
  const parseSuggestion = (displayName: string) => {
    const parts = displayName.split(",");
    const primary = parts[0] || "";
    const secondary = parts.slice(1).join(",").trim();
    return { primary, secondary };
  };

  return (
    <div className="space-y-4">
      {/* Dynamic Pulse and Drop animation styles */}
      <style>{`
        @keyframes marker-drop {
          0% { transform: translateY(-40px) scaleY(0.9); opacity: 0; }
          60% { transform: translateY(5px) scaleY(1.05); }
          80% { transform: translateY(-3px) scaleY(0.98); }
          100% { transform: translateY(-16px) scaleY(1); opacity: 1; }
        }
        @keyframes shadow-shrink {
          0% { transform: scale(0.3); opacity: 0.1; }
          100% { transform: scale(1); opacity: 0.25; }
        }
        .animate-marker-drop {
          animation: marker-drop 0.45s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
        }
        .marker-pulse {
          animation: shadow-shrink 0.45s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
        }
      `}</style>

      {/* Google-Maps-Style Floating Search bar */}
      <div ref={searchContainerRef} className="relative z-[999] max-w-xl">
        <div className="relative flex items-center">
          <Input
            type="text"
            placeholder={
              language === "en"
                ? "Search for precise location or address..."
                : "सटीक स्थान या पता खोजें..."
            }
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            className="pl-10 pr-10 h-11 border-border/80 shadow-sm rounded-xl focus-visible:ring-primary/45"
          />
          <Search className="absolute left-3.5 w-4.5 h-4.5 text-muted-foreground" />
          {isSearching && (
            <Loader2 className="absolute right-3.5 w-4 h-4 animate-spin text-muted-foreground" />
          )}
        </div>

        {/* Suggestion list */}
        {showSuggestions && searchQuery && suggestions.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border shadow-2xl rounded-xl max-h-60 overflow-y-auto z-[1000] p-1 divide-y divide-border/30">
            {suggestions.map((item) => {
              const { primary, secondary } = parseSuggestion(item.display_name);
              return (
                <button
                  key={item.place_id}
                  type="button"
                  onClick={() => handleSelectSuggestion(item)}
                  className="w-full text-left px-3 py-2.5 hover:bg-muted/50 transition-colors flex items-start gap-2.5 rounded-lg text-xs"
                >
                  <MapPin className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground truncate">{primary}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{secondary}</p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Leaflet Map Box Container */}
      <div className="relative border border-border rounded-2xl overflow-hidden shadow-sm h-[320px] bg-muted/20">
        <div ref={mapContainerRef} className="w-full h-full" />

        {/* Uber/Swiggy-Style Center Crosshair while moving map */}
        {isMapMoving && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[800]">
            <div className="w-10 h-10 rounded-full border-2 border-primary border-dashed flex items-center justify-center bg-primary/5 shadow-inner scale-100 transition-all duration-300">
              <div className="w-1.5 h-1.5 rounded-full bg-primary" />
            </div>
          </div>
        )}

        {/* Use Current Location Floating Button (Overlay Top Right) */}
        <div className="absolute top-3 right-3 z-[800]">
          <Button
            type="button"
            variant="secondary"
            onClick={handleUseCurrentLocation}
            disabled={isLocating}
            className="h-10 px-3.5 shadow-lg rounded-xl border border-border flex items-center gap-1.5 text-xs font-semibold bg-card/95 hover:bg-muted"
          >
            {isLocating ? (
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
            ) : (
              <Compass className="w-4 h-4 text-primary" />
            )}
            {language === "en" ? "Use Current Location" : "वर्तमान स्थान का उपयोग करें"}
          </Button>
        </div>

        {/* Map Center helper message overlay */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-[800] bg-card/90 backdrop-blur-sm border border-border/80 rounded-full px-3.5 py-1 text-[10px] font-medium text-muted-foreground shadow-md select-none">
          📍 {language === "en" ? "Move marker or click map for precision" : "सटीक स्थिति के लिए मार्कर खिसकाएं या नक्शे पर क्लिक करें"}
        </div>
      </div>

      {/* Confirmed Location Details Card */}
      <div className="p-4 border border-border/80 bg-muted/20 dark:bg-muted/5 rounded-2xl space-y-3 shadow-inner">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {language === "en" ? "Confirmed Location" : "पुष्टि किया गया स्थान"}
          </p>

          {latitude !== null && longitude !== null && (
            <Badge className="bg-green-500 hover:bg-green-600 text-white border-none text-[10px] font-bold py-0.5 px-2 flex items-center gap-1 rounded-full shadow-sm animate-pulse">
              <span>✓</span>
              <span>{language === "en" ? "Exact Location Selected" : "सटीक स्थान चयनित"}</span>
            </Badge>
          )}
        </div>

        <div className="space-y-1.5 text-xs">
          <div className="flex items-start gap-1.5">
            <span className="font-semibold text-muted-foreground shrink-0 w-16">
              {language === "en" ? "Address:" : "पता:"}
            </span>
            <span className="text-foreground font-medium leading-relaxed">
              {isReverseGeocoding ? (
                <span className="text-muted-foreground flex items-center gap-1.5 animate-pulse">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  {language === "en" ? "Reverse geocoding position..." : "पते की खोज की जा रही है..."}
                </span>
              ) : location ? (
                location
              ) : (
                <span className="text-muted-foreground">
                  {language === "en" ? "No location chosen yet" : "अभी कोई स्थान नहीं चुना गया है"}
                </span>
              )}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-1">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-muted-foreground w-16">
                {language === "en" ? "Latitude:" : "अक्षांश:"}
              </span>
              <span className="text-foreground font-mono font-bold">
                {latitude !== null ? latitude.toFixed(6) : "—"}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-muted-foreground w-16">
                {language === "en" ? "Longitude:" : "रेखांश:"}
              </span>
              <span className="text-foreground font-mono font-bold">
                {longitude !== null ? longitude.toFixed(6) : "—"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

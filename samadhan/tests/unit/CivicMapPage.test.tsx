import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import CivicMapPage from "@/features/civic-map/pages/CivicMapPage";
import { issueService } from "@/features/issues/services/issueService";

// Mock react-router-dom
vi.mock("react-router-dom", () => ({
  useSearchParams: () => [new URLSearchParams("?city=Bhopal")],
}));

// Mock the language provider hook
vi.mock("@/app/providers/LanguageProvider", () => ({
  useLanguage: () => ({ language: "en" }),
}));

// Mock leaflet completely to prevent JSDOM rendering issues
vi.mock("leaflet", () => {
  const mockMap = {
    setView: vi.fn(),
    flyTo: vi.fn(),
    remove: vi.fn(),
    invalidateSize: vi.fn(),
    addLayer: vi.fn(),
    removeLayer: vi.fn(),
  };
  const mockLayerGroup = {
    addTo: vi.fn(),
    clearLayers: vi.fn(),
    addLayer: vi.fn(),
  };
  mockLayerGroup.addTo.mockReturnValue(mockLayerGroup);
  const mockMarker = {
    bindPopup: vi.fn().mockReturnThis(),
    addTo: vi.fn().mockReturnThis(),
    options: { icon: {} },
    setIcon: vi.fn(),
    openPopup: vi.fn(),
  };

  return {
    default: {
      map: vi.fn().mockReturnValue(mockMap),
      tileLayer: vi.fn().mockReturnValue({
        addTo: vi.fn().mockReturnThis(),
      }),
      layerGroup: vi.fn().mockReturnValue(mockLayerGroup),
      marker: vi.fn().mockReturnValue(mockMarker),
      divIcon: vi.fn().mockReturnValue({}),
      Icon: {
        Default: {
          prototype: {},
          mergeOptions: vi.fn(),
        },
      },
    },
  };
});

// Mock issues data
const mockIssues = [
  {
    id: "1",
    user_id: "user1",
    title: "Water pipeline leak Sonagiri",
    description: "Huge water leakage near Sonagiri sector B",
    category: "Water Supply",
    location: "LIG B 55 Sonagiri Bhopal",
    status: "reported",
    latitude: 23.2628,
    longitude: 77.4562,
    created_at: "2026-06-25T10:00:00Z",
    supports_count: 5,
  },
  {
    id: "2",
    user_id: "user1",
    title: "Broken bench in MP Nagar",
    description: " बेंच टूटी हुई है",
    category: "Parks & Gardens",
    location: "Children's Park, MP Nagar, Bhopal",
    status: "in-progress",
    latitude: 23.2350,
    longitude: 77.4320,
    created_at: "2026-06-25T12:00:00Z",
    supports_count: 2,
  }
];

describe("CivicMapPage Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock the issues fetch method to return our custom mock data
    vi.spyOn(issueService, "fetchAllIssuesForMap").mockResolvedValue(
      mockIssues.map(i => issueService.mapResponseToDomain(i as any))
    );
  });

  it("renders the floating search box overlay with search input", async () => {
    render(<CivicMapPage />);

    // Check loading indicator shows up initially
    expect(screen.getByText(/Loading civic data…/i)).toBeInTheDocument();

    // Wait for the issues to load and render
    await waitFor(() => {
      expect(screen.queryByText(/Loading civic data…/i)).not.toBeInTheDocument();
    });

    // Check search input is rendered with the correct placeholder
    const searchInput = screen.getByPlaceholderText(/Search issues, cities, categories.../i);
    expect(searchInput).toBeInTheDocument();
  });
});

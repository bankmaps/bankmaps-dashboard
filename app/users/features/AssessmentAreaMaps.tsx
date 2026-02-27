"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { useOrganizations } from "./OrganizationsContext";

// ─── Census tileset lookup (one per year, source layer always "census") ───────
const CENSUS_CONFIG: Record<number, { tileset: string; sourceLayer: string }> = {
  2018: { tileset: "mapbox://stuartmaps.census-2018", sourceLayer: "census" },
  2019: { tileset: "mapbox://stuartmaps.census-2019", sourceLayer: "census" },
  2020: { tileset: "mapbox://stuartmaps.census-2020", sourceLayer: "census" },
  2021: { tileset: "mapbox://stuartmaps.census-2021", sourceLayer: "census" },
  2022: { tileset: "mapbox://stuartmaps.census-2022", sourceLayer: "census" },
  2023: { tileset: "mapbox://stuartmaps.census-2023", sourceLayer: "census" },
  2024: { tileset: "mapbox://stuartmaps.census-2024", sourceLayer: "census" },
  2025: { tileset: "mapbox://stuartmaps.census-2025", sourceLayer: "census" },
};

// Vintage mapping for geography_tracts and map_boundaries API calls
const YEAR_TO_VINTAGE: Record<number, number> = {
  2018: 2018, 2019: 2018,
  2020: 2020, 2021: 2020, 2022: 2020, 2023: 2020,
  2024: 2024, 2025: 2024,
};

// ─── Map definitions ──────────────────────────────────────────────────────────
const MAPS = [
  {
    id: "boundaries",
    title: "Assessment Area Boundaries",
    description: "Shaded footprint of your selected geography",
  },
  {
    id: "income-level",
    title: "Low-Moderate Income Geographies",
    description: "Census tracts shaded by income level classification",
  },
  {
    id: "majority-minority",
    title: "Majority-Minority Geographies",
    description: "Census tracts shaded by majority minority status",
  },
];

const YEARS = [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];

// ─── Color schemes ────────────────────────────────────────────────────────────
const INCOME_COLORS: Record<string, string> = {
  "Low":      "#d73027",
  "Moderate": "#fc8d59",
  "Middle":   "#fee090",
  "Upper":    "#4575b4",
  "Unknown":  "#cccccc",
};

const BOUNDARY_COLORS: Record<string, string> = {
  "Inside":  "#91bfdb",
  "Outside": "#f5f0e8",  // Beige for outside assessment area
};

const MINORITY_COLORS: Record<string, string> = {
  "White Majority":          "#4575b4",
  "Asian Majority":          "#fee090",
  "Black Majority":          "#d73027",
  "Hispanic Majority":       "#fc8d59",
  "Black+Hispanic Majority": "#e34a33",
  "Combined Majority":       "#7b2d8b",
  "NA":                      "#cccccc",
};

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AssessmentAreaMaps() {
  const mapContainerRef  = useRef<HTMLDivElement>(null);
  const mapRef           = useRef<any>(null);
  const slideTimerRef    = useRef<NodeJS.Timeout | null>(null);
  const isPausedRef      = useRef(false);
  const geographiesRef   = useRef<any[]>([]);

  const { organizations, selectedOrgId, setSelectedOrgId, selectedOrg, loading } = useOrganizations();

  const [mapLoaded,             setMapLoaded]             = useState(false);
  const [currentMapIdx,         setCurrentMapIdx]         = useState(0);
  const [isPlaying,             setIsPlaying]             = useState(false);
  const [isTransitioning,       setIsTransitioning]       = useState(false);
  const [selectedYear,          setSelectedYear]          = useState(2024);
  const [selectedGeographyName, setSelectedGeographyName] = useState<string>("");
  const [showTractNums,         setShowTractNums]         = useState(false);
  const [boundaries,            setBoundaries]            = useState<any[]>([]);
  const [assessmentGeoids,      setAssessmentGeoids]      = useState<string[]>([]);
  const [showPrintModal,        setShowPrintModal]        = useState(false);

  const currentMap = MAPS[currentMapIdx];
  const config     = CENSUS_CONFIG[selectedYear] || CENSUS_CONFIG[2024];
  const vintage    = YEAR_TO_VINTAGE[selectedYear] || 2024;

  // ── Initialize geography name from first geography when org changes ─────────
  useEffect(() => {
    if (selectedOrg?.geographies?.length > 0) {
      geographiesRef.current = selectedOrg.geographies;
      const firstGeoName = selectedOrg.geographies[0]?.name || "";
      console.log("[MAP] Initializing geography to:", firstGeoName);
      setSelectedGeographyName(firstGeoName);
    }
  }, [selectedOrg]);

  // ── Fetch map boundary overlay (for blue boundary line) ────────────────────
  useEffect(() => {
    if (!selectedOrgId) return;
    const token = localStorage.getItem("jwt_token")
               || localStorage.getItem("token")
               || localStorage.getItem("authToken")
               || localStorage.getItem("access_token");

    const encodedGeo = encodeURIComponent(selectedGeographyName);
    console.log(`[MAP] Fetching boundary: orgId=${selectedOrgId}, vintage=${vintage}, geography=${selectedGeographyName}`);

    fetch(`/api/boundaries/generate?orgId=${selectedOrgId}&vintage=${vintage}&geography=${encodedGeo}`, {
      headers: { Authorization: `Bearer ${token || ""}` }
    })
      .then(r => r.json())
      .then(data => {
        console.log("[MAP] Boundary data received:", data);
        setBoundaries(data.boundaries || []);
      })
      .catch(err => console.error("[MAP] fetch boundaries error:", err));
  }, [selectedOrgId, vintage, selectedGeographyName]);

  // ── Fetch assessment area geoids from geography_tracts ─────────────────────
  // Used only for the boundaries map to shade inside/outside tracts
  useEffect(() => {
    if (!selectedOrgId || !selectedGeographyName) return;
    const token = localStorage.getItem("jwt_token")
               || localStorage.getItem("token")
               || localStorage.getItem("authToken")
               || localStorage.getItem("access_token");

    const encodedGeo = encodeURIComponent(selectedGeographyName);
    console.log(`[MAP] Fetching geography tracts: orgId=${selectedOrgId}, geo=${selectedGeographyName}, year=${selectedYear}`);

    fetch(`/api/geography-tracts?orgId=${selectedOrgId}&geography=${encodedGeo}&year=${selectedYear}`, {
      headers: { Authorization: `Bearer ${token || ""}` }
    })
      .then(r => r.json())
      .then(data => {
        console.log(`[MAP] Got ${data.geoids?.length} assessment geoids`);
        setAssessmentGeoids(data.geoids || []);
      })
      .catch(err => console.error("[MAP] fetch geography tracts error:", err));
  }, [selectedOrgId, selectedGeographyName, selectedYear]);

  // ── Initialize Mapbox ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token) { console.error("No Mapbox token"); return; }

    mapboxgl.accessToken = token;

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/light-v11",
      center: [-98.5, 39.8],
      zoom: 3.5,
    });

    map.addControl(new mapboxgl.NavigationControl(), "top-right");

    map.on("load", () => {
      setMapLoaded(true);

      // Census tract vector tile source
      map.addSource("census-tracts", {
        type: "vector",
        url: config.tileset,
      });

      // Base fill layer - color applied by choropleth effects below
      map.addLayer({
        id: "tract-fill",
        type: "fill",
        source: "census-tracts",
        "source-layer": config.sourceLayer,
        paint: { "fill-color": "#e8e8e8", "fill-opacity": 0.6 },
      });

      // Tract outline
      map.addLayer({
        id: "tract-outline",
        type: "line",
        source: "census-tracts",
        "source-layer": config.sourceLayer,
        paint: { "line-color": "#999", "line-width": 0.3, "line-opacity": 0.5 },
      });

      // User geography boundary (blue line)
      map.addSource("user-boundary", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "user-boundary-fill",
        type: "fill",
        source: "user-boundary",
        paint: { "fill-color": "#0066FF", "fill-opacity": 0 },
      });
      map.addLayer({
        id: "user-boundary-line",
        type: "line",
        source: "user-boundary",
        paint: { "line-color": "#0066FF", "line-width": 3, "line-opacity": 0.9 },
      });

      // Tract number labels
      map.addLayer({
        id: "tract-labels",
        type: "symbol",
        source: "census-tracts",
        "source-layer": config.sourceLayer,
        layout: {
          "text-field": ["get", "tract_number"],
          "text-size": 8,
          "visibility": "none",
        },
        paint: { "text-color": "#333", "text-halo-color": "#fff", "text-halo-width": 1 },
      });
    });

    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // ── Swap tileset source when year changes ───────────────────────────────────
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;
    const map = mapRef.current;
    const newConfig = CENSUS_CONFIG[selectedYear] || CENSUS_CONFIG[2024];

    if (map.getLayer("tract-labels"))  map.removeLayer("tract-labels");
    if (map.getLayer("tract-outline")) map.removeLayer("tract-outline");
    if (map.getLayer("tract-fill"))    map.removeLayer("tract-fill");
    if (map.getSource("census-tracts")) map.removeSource("census-tracts");

    map.addSource("census-tracts", { type: "vector", url: newConfig.tileset });

    map.addLayer({
      id: "tract-fill",
      type: "fill",
      source: "census-tracts",
      "source-layer": newConfig.sourceLayer,
      paint: { "fill-color": "#e8e8e8", "fill-opacity": 0.6 },
    });
    map.addLayer({
      id: "tract-outline",
      type: "line",
      source: "census-tracts",
      "source-layer": newConfig.sourceLayer,
      paint: { "line-color": "#999", "line-width": 0.3, "line-opacity": 0.5 },
    });
    map.addLayer({
      id: "tract-labels",
      type: "symbol",
      source: "census-tracts",
      "source-layer": newConfig.sourceLayer,
      layout: {
        "text-field": ["get", "tract_number"],
        "text-size": 8,
        "visibility": showTractNums ? "visible" : "none",
      },
      paint: { "text-color": "#333", "text-halo-color": "#fff", "text-halo-width": 1 },
    });
  }, [mapLoaded, selectedYear]);

  // ── Update boundary overlay ─────────────────────────────────────────────────
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;
    const map = mapRef.current;

    const boundary = boundaries[0];
    if (!boundary?.boundary_geojson) {
      map.getSource("user-boundary")?.setData({ type: "FeatureCollection", features: [] });
      return;
    }

    map.getSource("user-boundary")?.setData({
      type: "Feature",
      geometry: boundary.boundary_geojson,
      properties: {}
    });

    if (boundary.center_point) {
      map.flyTo({
        center: [boundary.center_point.lng, boundary.center_point.lat],
        zoom: boundary.zoom_level || 10,
        duration: 0,
      });
    }
  }, [mapLoaded, boundaries]);

  // ── Apply choropleth colors based on current map type ──────────────────────
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;
    const map = mapRef.current;
    const sourceLayer = (CENSUS_CONFIG[selectedYear] || CENSUS_CONFIG[2024]).sourceLayer;

    if (currentMap.id === "income-level") {
      // Read income_level directly from tileset properties
      map.setPaintProperty("tract-fill", "fill-color", [
        "match", ["get", "income_level"],
        "Low",      INCOME_COLORS["Low"],
        "Moderate", INCOME_COLORS["Moderate"],
        "Middle",   INCOME_COLORS["Middle"],
        "Upper",    INCOME_COLORS["Upper"],
        INCOME_COLORS["Unknown"]
      ]);
      map.setPaintProperty("tract-fill", "fill-opacity", 0.7);

    } else if (currentMap.id === "majority-minority") {
      // Read majority_minority directly from tileset properties
      map.setPaintProperty("tract-fill", "fill-color", [
        "match", ["get", "majority_minority"],
        "White Majority",          MINORITY_COLORS["White Majority"],
        "Asian Majority",          MINORITY_COLORS["Asian Majority"],
        "Black Majority",          MINORITY_COLORS["Black Majority"],
        "Hispanic Majority",       MINORITY_COLORS["Hispanic Majority"],
        "Black+Hispanic Majority", MINORITY_COLORS["Black+Hispanic Majority"],
        "Combined Majority",       MINORITY_COLORS["Combined Majority"],
        MINORITY_COLORS["NA"]
      ]);
      map.setPaintProperty("tract-fill", "fill-opacity", 0.7);

    } else if (currentMap.id === "boundaries") {
      // Shade inside/outside based on geoids from geography_tracts
      if (assessmentGeoids.length > 0) {
        map.setPaintProperty("tract-fill", "fill-color", [
          "match", ["get", "GEOID"],
          assessmentGeoids, BOUNDARY_COLORS["Inside"],
          BOUNDARY_COLORS["Outside"]
        ]);
        map.setPaintProperty("tract-fill", "fill-opacity", 0.7);
      } else {
        map.setPaintProperty("tract-fill", "fill-color", "#e8e8e8");
        map.setPaintProperty("tract-fill", "fill-opacity", 0.3);
      }
    }
  }, [mapLoaded, currentMap, assessmentGeoids, selectedYear]);

  // ── Toggle tract number labels ──────────────────────────────────────────────
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;
    mapRef.current.setLayoutProperty(
      "tract-labels", "visibility", showTractNums ? "visible" : "none"
    );
  }, [mapLoaded, showTractNums]);

  // ── Slideshow controls ──────────────────────────────────────────────────────
  const goToMap = useCallback((idx: number) => {
    setTimeout(() => {
      setCurrentMapIdx(idx);
    }, 400);
  }, []);

  const nextMap = useCallback(() => {
    goToMap((currentMapIdx + 1) % MAPS.length);
  }, [currentMapIdx, goToMap]);

  useEffect(() => {
    if (slideTimerRef.current) clearInterval(slideTimerRef.current);
  }, [isPlaying, nextMap]);

  const handleMouseEnter = () => { isPausedRef.current = true;  setIsPlaying(false); };
  const handleMouseLeave = () => { isPausedRef.current = false; setIsPlaying(true);  };

  const handlePrintCurrent = () => { window.print(); };
  const handlePrintAll     = () => { alert("Generating full PDF report... (coming soon)"); };

  return (
    <>
      <div className="flex flex-col" style={{ fontFamily: "'Georgia', serif", height: "100%", minHeight: "600px" }}>

        {loading && (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-500">Loading organizations...</p>
          </div>
        )}

        {!loading && organizations.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-500">No organizations found. Please create one first.</p>
          </div>
        )}

        {!loading && organizations.length > 0 && (
        <>
        {/* ── Controls Bar ──────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 px-4 py-2 bg-gray-50 border-b border-gray-200 flex-wrap">

          {/* Organization selector */}
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Organization</label>
            <select
              value={selectedOrgId || ""}
              onChange={e => setSelectedOrgId(Number(e.target.value))}
              className="text-sm border border-gray-300 rounded px-2 py-1 bg-white"
            >
              {organizations.map(org => (
                <option key={org.id} value={org.id}>{org.name}</option>
              ))}
            </select>
          </div>

          <div className="w-px h-5 bg-gray-300" />

          {/* Geography selector */}
          {selectedOrg?.geographies?.length > 1 && (
            <>
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Area</label>
                <select
                  value={selectedGeographyName}
                  onChange={e => setSelectedGeographyName(e.target.value)}
                  className="text-sm border border-gray-300 rounded px-2 py-1 bg-white"
                >
                  {selectedOrg.geographies.map((geo: any, idx: number) => (
                    <option key={idx} value={geo.name}>{geo.name}</option>
                  ))}
                </select>
              </div>
              <div className="w-px h-5 bg-gray-300" />
            </>
          )}

          {/* Year selector */}
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Year</label>
            <select
              value={selectedYear}
              onChange={e => setSelectedYear(Number(e.target.value))}
              className="text-sm border border-gray-300 rounded px-2 py-1 bg-white"
            >
              {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          <div className="w-px h-5 bg-gray-300" />

          {/* Tract numbers toggle */}
          <button
            onClick={() => setShowTractNums(!showTractNums)}
            className={`text-xs px-3 py-1 rounded-full border font-medium ${
              showTractNums
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-gray-600 border-gray-300 hover:border-gray-400"
            }`}
          >
            🔢 Tract Numbers
          </button>

          <div className="w-px h-5 bg-gray-300" />

          {/* Boundary toggle */}
          <button
            onClick={() => {
              if (!mapRef.current) return;
              const vis = mapRef.current.getLayoutProperty("user-boundary-line", "visibility");
              const next = vis === "none" ? "visible" : "none";
              mapRef.current.setLayoutProperty("user-boundary-line", "visibility", next);
              mapRef.current.setLayoutProperty("user-boundary-fill", "visibility", next);
            }}
            className="text-xs px-3 py-1 rounded-full border font-medium bg-white text-gray-600 border-gray-300 hover:border-gray-400"
          >
            🗺️ Boundary
          </button>

          <div className="flex-1" />

          {/* Print button */}
          <button
            onClick={() => setShowPrintModal(true)}
            className="text-xs px-3 py-1 rounded-full border font-medium bg-white text-gray-600 border-gray-300 hover:border-gray-400"
          >
            🖨️ Print / Save
          </button>
        </div>

        {/* ── Narrative Bar ─────────────────────────────────────────────── */}
        <div className={`px-6 py-3 bg-white border-b border-gray-100 ${isTransitioning ? "opacity-0" : "opacity-100"}`}>
          <h2 className="text-lg font-bold text-gray-800">{currentMap.title}</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {selectedOrg?.name || "—"} &nbsp;·&nbsp; Year: {selectedYear} &nbsp;·&nbsp; {currentMap.description}
          </p>
        </div>

        {/* ── Map Area ──────────────────────────────────────────────────── */}
        <div
          className="relative overflow-hidden"
          style={{ flex: 1, minHeight: "450px", position: "relative" }}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <div
            ref={mapContainerRef}
            style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }}
            className={isTransitioning ? "opacity-0" : "opacity-100"}
          />

          {/* Legend */}
          {currentMap.id !== "boundaries" && (
            <div className="absolute bottom-8 left-4 bg-white rounded-lg shadow-lg p-3 z-10 text-xs">
              <div className="font-semibold text-gray-700 mb-2">
                {currentMap.id === "income-level" ? "Income Level" : "Majority Minority"}
              </div>
              {Object.entries(currentMap.id === "income-level" ? INCOME_COLORS : MINORITY_COLORS).map(([label, color]) => (
                <div key={label} className="flex items-center gap-2 mb-1">
                  <div className="w-4 h-3 rounded-sm" style={{ backgroundColor: color }} />
                  <span className="text-gray-600">{label}</span>
                </div>
              ))}
            </div>
          )}

          {/* Boundary legend */}
          {currentMap.id === "boundaries" && (
            <div className="absolute bottom-8 left-4 bg-white rounded-lg shadow-lg p-3 z-10 text-xs">
              <div className="font-semibold text-gray-700 mb-2">Assessment Area</div>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-4 h-3 rounded-sm" style={{ backgroundColor: BOUNDARY_COLORS["Inside"] }} />
                <span className="text-gray-600">Inside</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-3 rounded-sm" style={{ backgroundColor: BOUNDARY_COLORS["Outside"] }} />
                <span className="text-gray-600">Outside</span>
              </div>
            </div>
          )}

          {/* Blue boundary line legend */}
          <div className="absolute bottom-8 right-14 bg-white rounded-lg shadow-lg p-3 z-10 text-xs">
            <div className="flex items-center gap-2">
              <div className="w-6 h-1 bg-blue-600 rounded" />
              <span className="text-gray-600">Assessment Area</span>
            </div>
          </div>
        </div>

        {/* ── Slideshow Controls ─────────────────────────────────────────── */}
        <div className="flex items-center justify-center gap-3 px-4 py-3 bg-gray-50 border-t border-gray-200">
          <div className="flex items-center gap-2">
            {MAPS.map((m, idx) => (
              <button
                key={m.id}
                onClick={() => { setIsPlaying(false); goToMap(idx); }}
                className={`rounded-full text-xs font-medium px-3 py-1 ${
                  idx === currentMapIdx
                    ? "bg-blue-600 text-white"
                    : "bg-white text-gray-500 border border-gray-300 hover:border-gray-400"
                }`}
              >
                {m.title.split(" ")[0]}
              </button>
            ))}
          </div>

          <div className="w-px h-5 bg-gray-300" />

          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="flex items-center gap-1.5 text-xs px-3 py-1 rounded-full border border-gray-300 bg-white text-gray-600 hover:border-gray-400"
          >
            {isPlaying ? "⏸ Pause" : "▶ Play"}
          </button>

          <button
            onClick={() => { setIsPlaying(false); goToMap((currentMapIdx - 1 + MAPS.length) % MAPS.length); }}
            className="text-xs px-3 py-1 rounded-full border border-gray-300 bg-white text-gray-600 hover:border-gray-400"
          >
            ◄ Prev
          </button>
          <button
            onClick={() => { setIsPlaying(false); goToMap((currentMapIdx + 1) % MAPS.length); }}
            className="text-xs px-3 py-1 rounded-full border border-gray-300 bg-white text-gray-600 hover:border-gray-400"
          >
            Next ►
          </button>

          <span className="text-xs text-gray-400">
            {currentMapIdx + 1} / {MAPS.length}
          </span>
        </div>
        </>
        )}
      </div>
    </>
  );
}

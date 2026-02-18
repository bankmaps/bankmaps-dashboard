"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { useOrganizations } from "./OrganizationsContext";

// ─── Census vintage lookup ────────────────────────────────────────────────────
const YEAR_TO_VINTAGE: Record<number, number> = {
  2018: 2018, 2019: 2018,
  2020: 2020, 2021: 2020, 2022: 2020, 2023: 2020,
  2024: 2024, 2025: 2024,
};

const CENSUS_CONFIG: Record<number, { tileset: string; sourceLayer: string }> = {
  2018: { tileset: "mapbox://stuartmaps.avpxgs0u", sourceLayer: "2018-8q9vrr" },
  2020: { tileset: "mapbox://stuartmaps.6m3z799u", sourceLayer: "2020-9ythj8" },
  2024: { tileset: "mapbox://stuartmaps.58y5r823", sourceLayer: "2024-1pvgy8" },
};

// ─── Map definitions ──────────────────────────────────────────────────────────
const MAPS = [
  {
    id: "boundaries",
    title: "Assessment Area Boundaries",
    description: "Shaded footprint of your selected geography",
    metric: null,
    colorField: null,
  },
  {
    id: "income-level",
    title: "Low-Moderate Income Geographies",
    description: "Census tracts shaded by income level classification",
    metric: "income_level",
    colorField: "income_level",
  },
  {
    id: "majority-minority",
    title: "Majority-Minority Geographies",
    description: "Census tracts shaded by majority minority status",
    metric: "majority_minority",
    colorField: "majority_minority",
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

const MINORITY_COLORS: Record<string, string> = {
  "Yes": "#7b2d8b",
  "No":  "#2d8b7b",
  "Unknown": "#cccccc",
};

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AssessmentAreaMaps() {
  const mapContainerRef  = useRef<HTMLDivElement>(null);
  const mapRef           = useRef<any>(null);
  const slideTimerRef    = useRef<NodeJS.Timeout | null>(null);
  const isPausedRef      = useRef(false);

  const { organizations, selectedOrgId, setSelectedOrgId, selectedOrg, loading } = useOrganizations();

  const [mapLoaded,      setMapLoaded]      = useState(false);
  
  // Debug logging
  useEffect(() => {
    console.log("[MAP] Organizations context:", { 
      count: organizations.length, 
      selectedOrgId, 
      selectedOrg: selectedOrg?.name,
      loading 
    });
  }, [organizations, selectedOrgId, selectedOrg, loading]);
  const [currentMapIdx,  setCurrentMapIdx]  = useState(0);
  const [isPlaying,      setIsPlaying]      = useState(true);
  const [isTransitioning,setIsTransitioning]= useState(false);

  // Filters
  const [selectedYear,   setSelectedYear]   = useState(2024);
  const [showTractNums,  setShowTractNums]  = useState(false);
  const [boundaries,     setBoundaries]     = useState<any[]>([]);
  const [censusData,     setCensusData]     = useState<any[]>([]);

  // Print modal
  const [showPrintModal, setShowPrintModal] = useState(false);

  const currentMap = MAPS[currentMapIdx];
  const vintage    = YEAR_TO_VINTAGE[selectedYear] || 2024;
  const config     = CENSUS_CONFIG[vintage];

// ── Fetch boundaries when org/year changes ────────────────────────────────
  useEffect(() => {
    if (!selectedOrgId) return;
    const token = localStorage.getItem("jwt_token") 
               || localStorage.getItem("token")
               || localStorage.getItem("authToken")
               || localStorage.getItem("access_token");

    fetch(`/api/boundaries/generate?orgId=${selectedOrgId}&vintage=${vintage}`, {
      headers: { Authorization: `Bearer ${token || ""}` }
    })
      .then(r => r.json())
      .then(data => {
        console.log("[MAP] boundaries:", data.boundaries?.length);
        setBoundaries(data.boundaries || []);
      })
      .catch(err => console.error("[MAP] fetch boundaries error:", err));
  }, [selectedOrgId, vintage]);

  // ── Fetch census data for choropleth ─────────────────────────────────────
  useEffect(() => {
    if (!selectedOrgId || currentMap.metric === null) return;
    const token = localStorage.getItem("jwt_token");

    fetch(`/api/neon`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        sql: `
          SELECT DISTINCT geoid, ${currentMap.metric}
          FROM census_us
          WHERE year = '${selectedYear}'
            AND geoid IN (
              SELECT DISTINCT geoid FROM cached_hmda 
              WHERE organization_id = ${selectedOrgId}
            )
        `
      })
    })
      .then(r => r.json())
      .then(data => setCensusData(data.rows || []))
      .catch(console.error);
  }, [selectedOrgId, selectedYear, currentMap.metric]);

  // ── Initialize Mapbox ─────────────────────────────────────────────────────
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

      // Add census tract source
      map.addSource("census-tracts", {
        type: "vector",
        url: config.tileset,
      });

      // Base fill layer
      map.addLayer({
        id: "tract-fill",
        type: "fill",
        source: "census-tracts",
        "source-layer": config.sourceLayer,
        paint: { "fill-color": "#e8e8e8", "fill-opacity": 0.6 },
      });

      // Boundary outline layer
      map.addLayer({
        id: "tract-outline",
        type: "line",
        source: "census-tracts",
        "source-layer": config.sourceLayer,
        paint: { "line-color": "#999", "line-width": 0.3, "line-opacity": 0.5 },
      });

      // User geography boundary layer (blue)
      map.addSource("user-boundary", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "user-boundary-fill",
        type: "fill",
        source: "user-boundary",
        paint: { "fill-color": "#0066FF", "fill-opacity": 0.08 },
      });
      map.addLayer({
        id: "user-boundary-line",
        type: "line",
        source: "user-boundary",
        paint: { "line-color": "#0066FF", "line-width": 3, "line-opacity": 0.9 },
      });

      // Tract number labels layer
      map.addLayer({
        id: "tract-labels",
        type: "symbol",
        source: "census-tracts",
        "source-layer": config.sourceLayer,
        layout: {
          "text-field": ["get", "GEOID"],
          "text-size": 8,
          "visibility": "none",
        },
        paint: { "text-color": "#333", "text-halo-color": "#fff", "text-halo-width": 1 },
      });
    });

    mapRef.current = map;

    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // ── Update boundary overlay ───────────────────────────────────────────────
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;
    const map = mapRef.current;

    // Find boundary for selected vintage
    const boundary = boundaries[0];
    if (!boundary?.boundary_geojson) {
      map.getSource("user-boundary")?.setData({ type: "FeatureCollection", features: [] });
      return;
    }

    // Wrap geometry in Feature for Mapbox
    const geojsonData = {
      type: "Feature",
      geometry: boundary.boundary_geojson,
      properties: {}
    };
    
    map.getSource("user-boundary")?.setData(geojsonData);
    
    console.log("[MAP] Boundary loaded:", {
      type: boundary.boundary_geojson.type,
      area: boundary.total_area_sq_miles
    });

    // Fly to geography
    if (boundary.center_point) {
      map.flyTo({
        center: [boundary.center_point.lng, boundary.center_point.lat],
        zoom: boundary.zoom_level || 10,
        duration: 1500,
      });
    }
  }, [mapLoaded, boundaries]);

  // ── Update choropleth colors ──────────────────────────────────────────────
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;
    const map = mapRef.current;

    if (currentMap.id === "boundaries" || censusData.length === 0) {
      map.setPaintProperty("tract-fill", "fill-color", "#e8e8e8");
      map.setPaintProperty("tract-fill", "fill-opacity", 0.3);
      return;
    }

    const colors = currentMap.id === "income-level" ? INCOME_COLORS : MINORITY_COLORS;
    const field  = currentMap.colorField!;

    const colorExpr: any[] = ["match", ["get", "GEOID"]];
    censusData.forEach(row => {
      const color = colors[row[field]] || "#cccccc";
      colorExpr.push(row.geoid, color);
    });
    colorExpr.push("#e8e8e8");

    map.setPaintProperty("tract-fill", "fill-color", colorExpr);
    map.setPaintProperty("tract-fill", "fill-opacity", 0.7);
  }, [mapLoaded, censusData, currentMap]);

  // ── Toggle tract number labels ────────────────────────────────────────────
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;
    mapRef.current.setLayoutProperty(
      "tract-labels", "visibility", showTractNums ? "visible" : "none"
    );
  }, [mapLoaded, showTractNums]);

  // ── Slideshow timer ───────────────────────────────────────────────────────
  const goToMap = useCallback((idx: number) => {
    setIsTransitioning(true);
    setTimeout(() => {
      setCurrentMapIdx(idx);
      setIsTransitioning(false);
    }, 400);
  }, []);

  const nextMap = useCallback(() => {
    goToMap((currentMapIdx + 1) % MAPS.length);
  }, [currentMapIdx, goToMap]);

  useEffect(() => {
    if (!isPlaying) {
      if (slideTimerRef.current) clearInterval(slideTimerRef.current);
      return;
    }
    slideTimerRef.current = setInterval(nextMap, 5000);
    return () => { if (slideTimerRef.current) clearInterval(slideTimerRef.current); };
  }, [isPlaying, nextMap]);

  // ── Pause on hover ────────────────────────────────────────────────────────
  const handleMouseEnter = () => { isPausedRef.current = true; setIsPlaying(false); };
  const handleMouseLeave = () => { isPausedRef.current = false; setIsPlaying(true); };

  // ── Print helpers ─────────────────────────────────────────────────────────
  const handlePrintCurrent = () => { window.print(); };
  const handlePrintAll     = () => { alert("Generating full PDF report... (coming soon)"); };

  // ── Selected org name ─────────────────────────────────────────────────────


  return (
    <>
      <div className="flex flex-col" style={{ fontFamily: "'Georgia', serif", height: "100%", minHeight: "600px" }}>

        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-500">Loading organizations...</p>
          </div>
        )}

        {/* No orgs state */}
        {!loading && organizations.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-500">No organizations found. Please create one first.</p>
          </div>
        )}

        {/* Main content */}
        {!loading && organizations.length > 0 && (
        <>
        {/* ── Controls Bar ──────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 px-4 py-2 bg-gray-50 border-b border-gray-200 flex-wrap">

          {/* Geography selector */}
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Geography</label>
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
            className={`text-xs px-3 py-1 rounded-full border font-medium transition-colors ${
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
            className="text-xs px-3 py-1 rounded-full border font-medium bg-white text-gray-600 border-gray-300 hover:border-gray-400 transition-colors"
          >
            🗺️ Boundary
          </button>

          <div className="flex-1" />

          {/* Print button */}
          <button
            onClick={() => setShowPrintModal(true)}
            className="text-xs px-3 py-1 rounded-full border font-medium bg-white text-gray-600 border-gray-300 hover:border-gray-400 transition-colors"
          >
            🖨️ Print / Save
          </button>
        </div>

        {/* ── Narrative Bar ─────────────────────────────────────────────── */}
        <div
          className={`px-6 py-3 bg-white border-b border-gray-100 transition-opacity duration-400 ${
            isTransitioning ? "opacity-0" : "opacity-100"
          }`}
        >
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
          {/* Map container */}
          <div
            ref={mapContainerRef}
            style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }}
            className={`transition-opacity duration-400 ${
              isTransitioning ? "opacity-0" : "opacity-100"
            }`}
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
          <div className="absolute bottom-8 right-14 bg-white rounded-lg shadow-lg p-3 z-10 text-xs">
            <div className="flex items-center gap-2">
              <div className="w-6 h-1 bg-blue-600 rounded" />
              <span className="text-gray-600">Assessment Area</span>
            </div>
          </div>
        </div>

        {/* ── Slideshow Controls ─────────────────────────────────────────── */}
        <div className="flex items-center justify-center gap-3 px-4 py-3 bg-gray-50 border-t border-gray-200">

          {/* Map selector dots/buttons */}
          <div className="flex items-center gap-2">
            {MAPS.map((m, idx) => (
              <button
                key={m.id}
                onClick={() => { setIsPlaying(false); goToMap(idx); }}
                className={`transition-all duration-200 rounded-full text-xs font-medium px-3 py-1 ${
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

          {/* Play/Pause */}
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="flex items-center gap-1.5 text-xs px-3 py-1 rounded-full border border-gray-300 bg-white text-gray-600 hover:border-gray-400 transition-colors"
          >
            {isPlaying ? "⏸ Pause" : "▶ Play"}
          </button>

          {/* Prev / Next */}
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

          {/* Progress indicator */}
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

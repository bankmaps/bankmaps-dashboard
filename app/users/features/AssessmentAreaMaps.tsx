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
  "Low":      "#ff0000",
  "Moderate": "#ffff00",
  "Middle":   "#aaaa7f",
  "Upper":    "#d6d6a0",
  "Unknown":  "#7d7d7d",
};

const BOUNDARY_COLORS: Record<string, string> = {
  "Inside":  "#00aa7f",
  "Outside": "#aaaa7f",
};

const MINORITY_COLORS: Record<string, string> = {
  "White Majority":          "#aaaa7f",
  "Asian Majority":          "#00fbff",
  "Black Majority":          "#aa00ff",
  "Hispanic Majority":       "#ff0000",
  "Black+Hispanic Majority": "#00ff00",
  "Combined Majority":       "#ffff00",
  "NA":                      "#7d7d7d",
};

// ─── Popup HTML builders ─────────────────────────────────────────────────────

function buildPopupHTML(mapId: string, props: Record<string, any>): string {
  const s = 'font-family:sans-serif;font-size:11px;line-height:1.3;';
  const rowS = 'display:flex;justify-content:space-between;gap:12px;margin-bottom:1px;';

  const header = `
    <div style="font-size:12px;margin-bottom:1px;">Tract ${props.tract_text} in ${props.townname}, ${props.stateabbrev}</div>
    <div style="color:#555;margin-bottom:1px;">${props.countyname}</div>
    <div style="color:#555;margin-bottom:3px;">${props.msaname}</div>
    <div style="margin-bottom:3px;border-bottom:1px solid #ddd;padding-bottom:2px;">${props.income_level} &ndash; ${props.majority_minority}</div>`;

  const row = (label: string, val: any) =>
    `<div style="${rowS}"><span style="color:#555;">${label}</span><span>${val}</span></div>`;

  if (mapId === 'boundaries') {
    return `<div style="${s}padding:6px 8px;">${header}</div>`;
  }

  if (mapId === 'income-level') {
    return `<div style="${s}padding:6px 8px;min-width:190px;">
      ${header}
      ${row('Tract MFI', props.tract_median_family_income)}
      ${row('MSA MFI', props.msa_median_family_income)}
      ${row('Tract % of MSA', props.tract_median_family_income_percent)}
    </div>`;
  }

  if (mapId === 'majority-minority') {
    const prow = (label: string, val: any, pct: any) =>
      `<div style="${rowS}"><span style="color:#555;">${label}</span><span>${val} (${pct})</span></div>`;
    return `<div style="${s}padding:6px 8px;min-width:210px;">
      ${header}
      ${row('Population', props.total_population)}
      ${prow('White Non-Hispanic', props.white_nonhispanic_population, props.white_nonhispanic_population_percent)}
      ${prow('Minority', props.minority_population, props.minority_population_percent)}
      ${prow('Asian', props.asian_population, props.asian_population_percent)}
      ${prow('Black/African American', props.black_population, props.black_population_percent)}
      ${prow('Hawaiian/Other Pacific Isl.', props.hawaiian_other_pacific_islander_population, props.hawaiian_other_pacific_islander_population_percent)}
      ${prow('Native American/Alaskan', props.native_american_population, props.native_american_population_percent)}
      ${prow('Two or More Races', props.two_or_more_races_population, props.two_or_more_races_population_percent)}
      ${prow('White', props.white_population, props.white_population_percent)}
      ${prow('Other Race', props.other_race_population, props.other_race_population_percent)}
      ${prow('Hispanic or Latino', props.hispanic_population, props.hispanic_population_percent)}
    </div>`;
  }

  return '';
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AssessmentAreaMaps() {
  const mapContainerRef  = useRef<HTMLDivElement>(null);
  const mapRef           = useRef<any>(null);
  const slideTimerRef    = useRef<NodeJS.Timeout | null>(null);
  const isPausedRef      = useRef(false);
  const geographiesRef   = useRef<any[]>([]);
  const popupRef         = useRef<any>(null);
  const currentMapIdRef  = useRef<string>('boundaries');
  const selectedYearRef  = useRef<number>(2024);
  const showHoverRef     = useRef<boolean>(true);
  const branchPopupRef   = useRef<any>(null);

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
  const [showHover,             setShowHover]             = useState(true);
  const [showSummary,           setShowSummary]           = useState(true);
  const [summaryData,           setSummaryData]           = useState<any>(null);
  const [showBranches,          setShowBranches]          = useState(true);
  const [branches,              setBranches]              = useState<any[]>([]);

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

  // ── Fetch summary data ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedOrgId || !selectedGeographyName) return;
    const token = localStorage.getItem("jwt_token")
               || localStorage.getItem("token")
               || localStorage.getItem("authToken")
               || localStorage.getItem("access_token");

    const encodedGeo = encodeURIComponent(selectedGeographyName);
    fetch(`/api/geography-tracts/summary?orgId=${selectedOrgId}&geography=${encodedGeo}&year=${selectedYear}`, {
      headers: { Authorization: `Bearer ${token || ""}` }
    })
      .then(r => r.json())
      .then(data => {
        console.log('[MAP] Summary data received:', data);
        setSummaryData(data);
      })
      .catch(err => console.error('[MAP] fetch summary error:', err));
  }, [selectedOrgId, selectedGeographyName, selectedYear]);

  // ── Fetch branch locations ───────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedOrgId) return;
    const token = localStorage.getItem("jwt_token")
               || localStorage.getItem("token")
               || localStorage.getItem("authToken")
               || localStorage.getItem("access_token");

    fetch(`/api/branches?orgId=${selectedOrgId}`, {
      headers: { Authorization: `Bearer ${token || ""}` }
    })
      .then(r => r.json())
      .then(data => {
        console.log(`[MAP] Got ${data.branches?.length} branches`);
        setBranches(data.branches || []);
      })
      .catch(err => console.error('[MAP] fetch branches error:', err));
  }, [selectedOrgId]);

  // ── Update branch points on map ───────────────────────────────────────────
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;
    const map = mapRef.current;

    const features = branches.map((b: any) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [b.lon, b.lat] },
      properties: {
        branchtype:    b.branchtype,
        lendername:    b.lendername || '',
        regulator:     b.regulator || '',
        branchaddress: b.branchaddress || '',
        branchcity:    b.branchcity || '',
        branchstate:   b.branchstate || '',
      }
    }));

    map.getSource('branches')?.setData({
      type: 'FeatureCollection',
      features
    });

    // Ensure branch points stay on top
    if (map.getLayer('branch-points'))      map.moveLayer('branch-points');
    if (map.getLayer('user-boundary-fill')) map.moveLayer('user-boundary-fill');
    if (map.getLayer('user-boundary-line')) map.moveLayer('user-boundary-line');
  }, [mapLoaded, branches]);

  // ── Toggle branch visibility ──────────────────────────────────────────────
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;
    mapRef.current.setLayoutProperty(
      'branch-points', 'visibility', showBranches ? 'visible' : 'none'
    );
  }, [mapLoaded, showBranches]);

  // ── Initialize Mapbox ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token) { console.error("No Mapbox token"); return; }

    mapboxgl.accessToken = token;

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/streets-v12",
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
          "text-field": ["get", "tract_text"],
          "text-size": 8,
          "visibility": "none",
        },
        paint: { "text-color": "#333", "text-halo-color": "#fff", "text-halo-width": 1 },
      });

      // Hover highlight layer
      map.addLayer({
        id: "tract-highlight",
        type: "line",
        source: "census-tracts",
        "source-layer": config.sourceLayer,
        paint: {
          "line-color": "#333",
          "line-width": 2,
          "line-opacity": 0,
        },
        filter: ["==", "GEOID", ""],
      });

      // Branch points source + layers (empty until data loads)
      map.addSource("branches", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] }
      });
      map.addLayer({
        id: "branch-points",
        type: "circle",
        source: "branches",
        paint: {
          "circle-radius": 6,
          "circle-color": [
            "match", ["get", "branchtype"],
            "Main Office", "#ff6600",
            "Branch",      "#0066ff",
            "#888888"
          ],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1.5,
        },
      });

      // Move boundary layers to top so they render above everything
      if (map.getLayer("user-boundary-fill")) map.moveLayer("user-boundary-fill");
      if (map.getLayer("user-boundary-line")) map.moveLayer("user-boundary-line");

      // ── Branch hover popup ──────────────────────────────────────────────
      map.on('mouseenter', 'branch-points', (e: any) => {
        if (!e.features || e.features.length === 0) return;
        map.getCanvas().style.cursor = 'pointer';
        const p = e.features[0].properties;
        const html = `<div style="font-family:sans-serif;font-size:11px;line-height:1.3;padding:6px 8px;min-width:180px;">
          <div style="margin-bottom:2px;">${p.lendername} (${p.regulator})</div>
          <div style="color:#555;margin-bottom:1px;">${p.branchaddress}, ${p.branchcity}, ${p.branchstate}</div>
          <div style="color:#555;">${p.branchtype}</div>
        </div>`;
        if (!branchPopupRef.current) {
          branchPopupRef.current = new mapboxgl.Popup({
            closeButton: false,
            closeOnClick: false,
            maxWidth: '280px',
            offset: [16, 0],
            anchor: 'left',
          });
        }
        branchPopupRef.current.setLngLat(e.lngLat).setHTML(html).addTo(map);
      });

      map.on('mouseleave', 'branch-points', () => {
        map.getCanvas().style.cursor = '';
        if (branchPopupRef.current) {
          branchPopupRef.current.remove();
          branchPopupRef.current = null;
        }
      });
    });

    // ── Hover popup + highlight ──────────────────────────────────────────────
    map.on('mousemove', 'tract-fill', (e: any) => {
      if (!e.features || e.features.length === 0) return;

      // Highlight hovered tract outline
      const geoid = e.features[0].properties.GEOID;
      map.setFilter('tract-highlight', ['==', 'GEOID', geoid]);
      map.setPaintProperty('tract-highlight', 'line-opacity', 1);

      if (!showHoverRef.current) return;
      map.getCanvas().style.cursor = 'pointer';

      const lngLat = e.lngLat;
      const currentMapId = currentMapIdRef.current;

      // Fetch full tract data from census_us via API
      const token = localStorage.getItem("jwt_token")
                 || localStorage.getItem("token")
                 || localStorage.getItem("authToken")
                 || localStorage.getItem("access_token");

      fetch(`/api/popup?geoid=${geoid}&year=${selectedYearRef.current}`, {
        headers: { Authorization: `Bearer ${token || ""}` }
      })
        .then(r => r.json())
        .then(props => {
          if (!map || !showHoverRef.current) return;

          const html = buildPopupHTML(currentMapId, props);
          if (!html) return;

          if (!popupRef.current) {
            popupRef.current = new mapboxgl.Popup({
              closeButton: false,
              closeOnClick: false,
              maxWidth: '320px',
              offset: [16, 0],
              anchor: 'left',
            });
          }

          popupRef.current
            .setLngLat(lngLat)
            .setHTML(html)
            .addTo(map);
        })
        .catch(err => console.error('[POPUP] fetch error:', err));
    });

    map.on('mouseleave', 'tract-fill', () => {
      map.getCanvas().style.cursor = '';
      map.setFilter('tract-highlight', ['==', 'GEOID', '']);
      map.setPaintProperty('tract-highlight', 'line-opacity', 0);
      if (popupRef.current) {
        popupRef.current.remove();
        popupRef.current = null;
      }
    });

    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // ── Swap tileset source when year changes ───────────────────────────────────
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;
    const map = mapRef.current;
    const newConfig = CENSUS_CONFIG[selectedYear] || CENSUS_CONFIG[2024];

    if (map.getLayer("tract-labels"))    map.removeLayer("tract-labels");
    if (map.getLayer("tract-highlight")) map.removeLayer("tract-highlight");
    if (map.getLayer("tract-outline"))   map.removeLayer("tract-outline");
    if (map.getLayer("tract-fill"))      map.removeLayer("tract-fill");
    if (map.getSource("census-tracts"))  map.removeSource("census-tracts");

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
        "text-field": ["get", "tract_text"],
        "text-size": 8,
        "visibility": showTractNums ? "visible" : "none",
      },
      paint: { "text-color": "#333", "text-halo-color": "#fff", "text-halo-width": 1 },
    });
    map.addLayer({
      id: "tract-highlight",
      type: "line",
      source: "census-tracts",
      "source-layer": newConfig.sourceLayer,
      paint: { "line-color": "#333", "line-width": 2, "line-opacity": 0 },
      filter: ["==", "GEOID", ""],
    });

    // Keep branch points and boundary lines on top
    if (map.getLayer("branch-points"))     map.moveLayer("branch-points");
    if (map.getLayer("user-boundary-fill")) map.moveLayer("user-boundary-fill");
    if (map.getLayer("user-boundary-line")) map.moveLayer("user-boundary-line");
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

  // ── Sync showHoverRef ────────────────────────────────────────────────────────
  useEffect(() => {
    showHoverRef.current = showHover;
    // Remove popup immediately when hover turned off
    if (!showHover && popupRef.current) {
      popupRef.current.remove();
      popupRef.current = null;
    }
  }, [showHover]);

  // ── Keep selectedYearRef in sync ────────────────────────────────────────────
  useEffect(() => {
    selectedYearRef.current = selectedYear;
  }, [selectedYear]);

  // ── Keep currentMapIdRef in sync so hover popup knows which layout to use ──
  useEffect(() => {
    currentMapIdRef.current = currentMap.id;
    selectedYearRef.current = selectedYear;
  }, [currentMap]);

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

          {/* Hover toggle */}
          <button
            onClick={() => setShowHover(!showHover)}
            className={`text-xs px-3 py-1 rounded-full border font-medium ${
              showHover
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-gray-600 border-gray-300 hover:border-gray-400"
            }`}
          >
            💬 Hover
          </button>

          <div className="w-px h-5 bg-gray-300" />

          {/* Summary table toggle */}
          <button
            onClick={() => setShowSummary(!showSummary)}
            className={`text-xs px-3 py-1 rounded-full border font-medium ${
              showSummary
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-gray-600 border-gray-300 hover:border-gray-400"
            }`}
          >
            📊 Summary
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

          {/* Branches toggle */}
          <button
            onClick={() => setShowBranches(!showBranches)}
            className={`text-xs px-3 py-1 rounded-full border font-medium ${
              showBranches
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-gray-600 border-gray-300 hover:border-gray-400"
            }`}
          >
            🏦 Branches
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

          {/* Branch legend */}
          {showBranches && branches.length > 0 && (
            <div className="absolute bottom-20 left-4 bg-white rounded-lg shadow-lg p-3 z-10 text-xs">
              <div className="font-semibold text-gray-700 mb-2">Branches</div>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-3 h-3 rounded-full border border-white" style={{backgroundColor:'#ff6600'}} />
                <span className="text-gray-600">Main Office</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full border border-white" style={{backgroundColor:'#0066ff'}} />
                <span className="text-gray-600">Branch</span>
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

          {/* Summary table - top right */}
          {showSummary && summaryData && (
            <div className="absolute top-3 right-3 z-10 bg-white border border-black rounded p-2 text-xs max-w-xs" style={{fontFamily:'sans-serif', lineHeight:'1.3'}}>

              {/* Boundary map summary */}
              {currentMap.id === 'boundaries' && (
                <div>
                  <div style={{marginBottom:'3px', color:'#333'}}>
                    Assessment area covers {summaryData.msas?.length === 1
                      ? `the ${summaryData.msas[0].msa} MSA`
                      : summaryData.msas?.length > 1
                        ? `portions of ${summaryData.msas.map((m: any) => m.msa).join(', ')}`
                        : 'the selected geography'
                    }.
                  </div>
                  <div style={{color:'#555'}}>{summaryData.income?.totalTracts} census tracts</div>
                </div>
              )}

              {/* Income level summary table */}
              {currentMap.id === 'income-level' && summaryData.income && (() => {
                const { items, totalTracts, totalHouseholds, lmSubtotal } = summaryData.income;
                const order = ['Low','Moderate','Middle','Upper','NA'];
                const sorted = [...items].sort((a:any,b:any) => order.indexOf(a.label) - order.indexOf(b.label));
                return (
                  <table style={{borderCollapse:'collapse', width:'100%', minWidth:'240px'}}>
                    <thead>
                      <tr style={{borderBottom:'1px solid #ccc'}}>
                        <th style={{textAlign:'left', paddingRight:'8px', color:'#555', fontWeight:'normal'}}></th>
                        <th style={{textAlign:'right', paddingRight:'6px', color:'#555', fontWeight:'normal'}}># Tracts</th>
                        <th style={{textAlign:'right', paddingRight:'6px', color:'#555', fontWeight:'normal'}}>%</th>
                        <th style={{textAlign:'right', paddingRight:'6px', color:'#555', fontWeight:'normal'}}># HH</th>
                        <th style={{textAlign:'right', color:'#555', fontWeight:'normal'}}>%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map((row: any) => (
                        <tr key={row.label}>
                          <td style={{paddingRight:'8px', color:'#333'}}>{row.label}</td>
                          <td style={{textAlign:'right', paddingRight:'6px'}}>{row.tract_count.toLocaleString()}</td>
                          <td style={{textAlign:'right', paddingRight:'6px'}}>{row.tract_pct}%</td>
                          <td style={{textAlign:'right', paddingRight:'6px'}}>{row.household_count.toLocaleString()}</td>
                          <td style={{textAlign:'right'}}>{row.household_pct}%</td>
                        </tr>
                      ))}
                      <tr style={{borderTop:'1px solid #ccc'}}>
                        <td style={{paddingRight:'8px', color:'#333'}}>Total</td>
                        <td style={{textAlign:'right', paddingRight:'6px'}}>{totalTracts.toLocaleString()}</td>
                        <td style={{textAlign:'right', paddingRight:'6px'}}>100%</td>
                        <td style={{textAlign:'right', paddingRight:'6px'}}>{totalHouseholds.toLocaleString()}</td>
                        <td style={{textAlign:'right'}}>100%</td>
                      </tr>
                      <tr style={{borderTop:'1px solid #eee'}}>
                        <td style={{paddingRight:'8px', color:'#333'}}>Low-Moderate</td>
                        <td style={{textAlign:'right', paddingRight:'6px'}}>{lmSubtotal.tract_count.toLocaleString()}</td>
                        <td style={{textAlign:'right', paddingRight:'6px'}}>{lmSubtotal.tract_pct}%</td>
                        <td style={{textAlign:'right', paddingRight:'6px'}}>{lmSubtotal.household_count.toLocaleString()}</td>
                        <td style={{textAlign:'right'}}>{lmSubtotal.household_pct}%</td>
                      </tr>
                    </tbody>
                  </table>
                );
              })()}

              {/* Majority minority summary table */}
              {currentMap.id === 'majority-minority' && summaryData.minority && (() => {
                const { items, totalTracts, totalHouseholds, mmSubtotal } = summaryData.minority;
                const order = ['Asian Majority','Black Majority','Hispanic Majority','Black+Hispanic Majority','Combined Majority','White Majority','NA'];
                const sorted = [...items].sort((a:any,b:any) => order.indexOf(a.label) - order.indexOf(b.label));
                return (
                  <table style={{borderCollapse:'collapse', width:'100%', minWidth:'240px'}}>
                    <thead>
                      <tr style={{borderBottom:'1px solid #ccc'}}>
                        <th style={{textAlign:'left', paddingRight:'8px', color:'#555', fontWeight:'normal'}}></th>
                        <th style={{textAlign:'right', paddingRight:'6px', color:'#555', fontWeight:'normal'}}># Tracts</th>
                        <th style={{textAlign:'right', paddingRight:'6px', color:'#555', fontWeight:'normal'}}>%</th>
                        <th style={{textAlign:'right', paddingRight:'6px', color:'#555', fontWeight:'normal'}}># HH</th>
                        <th style={{textAlign:'right', color:'#555', fontWeight:'normal'}}>%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map((row: any) => (
                        <tr key={row.label}>
                          <td style={{paddingRight:'8px', color:'#333'}}>{row.label.replace(' Majority','')}</td>
                          <td style={{textAlign:'right', paddingRight:'6px'}}>{row.tract_count.toLocaleString()}</td>
                          <td style={{textAlign:'right', paddingRight:'6px'}}>{row.tract_pct}%</td>
                          <td style={{textAlign:'right', paddingRight:'6px'}}>{row.household_count.toLocaleString()}</td>
                          <td style={{textAlign:'right'}}>{row.household_pct}%</td>
                        </tr>
                      ))}
                      <tr style={{borderTop:'1px solid #ccc'}}>
                        <td style={{paddingRight:'8px', color:'#333'}}>Total</td>
                        <td style={{textAlign:'right', paddingRight:'6px'}}>{totalTracts.toLocaleString()}</td>
                        <td style={{textAlign:'right', paddingRight:'6px'}}>100%</td>
                        <td style={{textAlign:'right', paddingRight:'6px'}}>{totalHouseholds.toLocaleString()}</td>
                        <td style={{textAlign:'right'}}>100%</td>
                      </tr>
                      <tr style={{borderTop:'1px solid #eee'}}>
                        <td style={{paddingRight:'8px', color:'#333'}}>Majority Minority</td>
                        <td style={{textAlign:'right', paddingRight:'6px'}}>{mmSubtotal.tract_count.toLocaleString()}</td>
                        <td style={{textAlign:'right', paddingRight:'6px'}}>{mmSubtotal.tract_pct}%</td>
                        <td style={{textAlign:'right', paddingRight:'6px'}}>{mmSubtotal.household_count.toLocaleString()}</td>
                        <td style={{textAlign:'right'}}>{mmSubtotal.household_pct}%</td>
                      </tr>
                    </tbody>
                  </table>
                );
              })()}

            </div>
          )}
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

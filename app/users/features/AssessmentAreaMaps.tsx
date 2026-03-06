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
  2024: { tileset: "mapbox://stuartmaps.93jkr67o", sourceLayer: "census_2024-3x4oxo" },
  2025: { tileset: "mapbox://stuartmaps.census-2025", sourceLayer: "census" },
};

// Vintage mapping for geography_tracts and map_boundaries API calls - ARE WE STILL USING THIS
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
  "Low Income":      "#ff0000",
  "Low":      "#ff0000",
  "Moderate Income": "#ffff00",
  "Moderate": "#ffff00",
  "Middle Income":   "#aaaa7f",
  "Middle":   "#aaaa7f",
  "Upper Income":    "#d6d6a0",
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

  const fmt = (n: any) => n != null ? Number(n).toLocaleString() : 'N/A';
  const pct  = (n: any) => n != null ? `${Number(n).toFixed(1)}%` : 'N/A';

  const header = `
    <div style="font-size:12px;margin-bottom:1px;">Tract ${props.tract_number} in ${props.town}, ${props.st}</div>
    <div style="color:#555;margin-bottom:1px;">${props.county}</div>
    <div style="color:#555;margin-bottom:3px;">${props.msa}</div>
    <div style="margin-bottom:3px;border-bottom:1px solid #ddd;padding-bottom:2px;">${props.income_level} &ndash; ${props.majority_minority}</div>`;

  const row = (label: string, val: any) =>
    `<div style="${rowS}"><span style="color:#555;">${label}</span><span>${val}</span></div>`;

  if (mapId === 'boundaries') {
    return `<div style="${s}padding:6px 8px;">${header}</div>`;
  }

  if (mapId === 'income-level') {
    const tractMFI = fmt(props.tract_median_family_income);
    const msaMFI   = fmt(props.msa_median_family_income);
    const tractPct = props.tract_median_family_income != null && props.msa_median_family_income != null
      ? pct((props.tract_median_family_income / props.msa_median_family_income) * 100)
      : 'N/A';
    return `<div style="${s}padding:6px 8px;min-width:190px;">
      ${header}
      ${row('Tract MFI', tractMFI)}
      ${row('MSA MFI', msaMFI)}
      ${row('Tract % of MSA', tractPct)}
    </div>`;
  }

  if (mapId === 'majority-minority') {
    const pop = props.total_population || 0;
    const prow = (label: string, val: any) => {
      const n = val || 0;
      const p = pop > 0 ? pct((n / pop) * 100) : 'N/A';
      return `<div style="${rowS}"><span style="color:#555;">${label}</span><span>${fmt(n)} (${p})</span></div>`;
    };
    return `<div style="${s}padding:6px 8px;min-width:210px;">
      ${header}
      ${row('Population', fmt(pop))}
      ${prow('White Non-Hispanic', props.white_nonhispanic_population)}
      ${prow('Minority', props.minority_population)}
      ${prow('Asian', props.asian_population)}
      ${prow('Black/African American', props.black_population)}
      ${prow('Hawaiian/Other Pacific Isl.', props.hawaiian_other_pacific_islander_population)}
      ${prow('Native American/Alaskan', props.native_american_population)}
      ${prow('Two or More Races', props.two_or_more_races_population)}
      ${prow('White', props.white_population)}
      ${prow('Other Race', props.other_race_population)}
      ${prow('Hispanic or Latino', props.hispanic_population)}
    </div>`;
  }

  return '';
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AssessmentAreaMaps() {
  const mapContainerRef  = useRef<HTMLDivElement>(null);
  const mapAreaRef       = useRef<HTMLDivElement>(null);
  const frameWrapperRef  = useRef<HTMLDivElement>(null);
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
  const [frameDimensions, setFrameDimensions] = useState({ width: 800, height: 580 });
  const [currentMapIdx,         setCurrentMapIdx]         = useState(0);
  const [isPlaying,             setIsPlaying]             = useState(false);
  const [isTransitioning,       setIsTransitioning]       = useState(false);
  const [selectedYear,          setSelectedYear]          = useState(2024);
  const [selectedGeographyName, setSelectedGeographyName] = useState<string>("");
  const [showTractNums,         setShowTractNums]         = useState(false);
  const [boundaries,            setBoundaries]            = useState<any[]>([]);
  const [assessmentGeoids,      setAssessmentGeoids]      = useState<string[]>([]);
  const [isPdfLoading, setIsPdfLoading] = useState<"current" | "series" | null>(null);
  const [showHover,             setShowHover]             = useState(true);
  const [showSummary,           setShowSummary]           = useState(true);
  const [summaryData,           setSummaryData]           = useState<any>(null);
  const [showBranches,          setShowBranches]          = useState(true);
  const [branches,              setBranches]              = useState<any[]>([]);
  const [showBoundary,          setShowBoundary]          = useState(true);

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
      preserveDrawingBuffer: true,
    });

    // NavigationControl moved to custom position below title box

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
        paint: { "fill-color": "#e8e8e8", "fill-opacity": 0.4 },
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

      // Draw a red square icon into an offscreen canvas and register it
      const squareSize = 10;
      const squareCanvas = document.createElement('canvas');
      squareCanvas.width = squareSize;
      squareCanvas.height = squareSize;
      const ctx = squareCanvas.getContext('2d')!;
      ctx.fillStyle = '#cc0000';
      ctx.fillRect(0, 0, squareSize, squareSize);
      const squareImageData = ctx.getImageData(0, 0, squareSize, squareSize);
      map.addImage('branch-square', { width: squareSize, height: squareSize, data: squareImageData.data as unknown as Uint8Array });

      map.addLayer({
        id: "branch-points",
        type: "symbol",
        source: "branches",
        layout: {
          "icon-image": "branch-square",
          "icon-size": 1,
          "icon-allow-overlap": true,
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
    let hoverDebounceTimer: ReturnType<typeof setTimeout> | null = null;
    let lastGeoid: string | null = null;

    map.on('mousemove', 'tract-fill', (e: any) => {
      if (!e.features || e.features.length === 0) return;

      const geoid = e.features[0].properties.GEOID;
      const lngLat = e.lngLat;

      if (!showHoverRef.current) return;
      map.getCanvas().style.cursor = 'pointer';

      // Move existing popup to current cursor position immediately
      if (popupRef.current) {
        popupRef.current.setLngLat(lngLat);
      }

      // Only fetch/highlight if we moved to a different tract
      if (geoid === lastGeoid) return;
      lastGeoid = geoid;

      // Debounce both highlight and API fetch by 150ms
      if (hoverDebounceTimer) clearTimeout(hoverDebounceTimer);
      hoverDebounceTimer = setTimeout(() => {
        map.setFilter('tract-highlight', ['==', 'GEOID', geoid]);
        map.setPaintProperty('tract-highlight', 'line-opacity', 1);
        const currentMapId = currentMapIdRef.current;
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
      }, 150);
    });

    map.on('mouseleave', 'tract-fill', () => {
      if (hoverDebounceTimer) clearTimeout(hoverDebounceTimer);
      lastGeoid = null;
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

  // ── Apply choropleth colors based on current map type ──────────────────────
  const applychoropleth = useCallback(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    const doApply = () => {
      if (currentMap.id === "income-level") {
        map.setPaintProperty("tract-fill", "fill-color", [
          "match", ["get", "income_level"],
          "Low",            INCOME_COLORS["Low"],
          "Low Income",     INCOME_COLORS["Low"],
          "Moderate",       INCOME_COLORS["Moderate"],
          "Moderate Income",INCOME_COLORS["Moderate"],
          "Middle",         INCOME_COLORS["Middle"],
          "Middle Income",  INCOME_COLORS["Middle"],
          "Upper",          INCOME_COLORS["Upper"],
          "Upper Income",   INCOME_COLORS["Upper"],
          INCOME_COLORS["Unknown"]
        ]);
        map.setPaintProperty("tract-fill", "fill-opacity", 0.4);

      } else if (currentMap.id === "majority-minority") {
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
        map.setPaintProperty("tract-fill", "fill-opacity", 0.4);

      } else if (currentMap.id === "boundaries") {
        if (assessmentGeoids.length > 0) {
          map.setPaintProperty("tract-fill", "fill-color", [
            "match", ["get", "GEOID"],
            assessmentGeoids, BOUNDARY_COLORS["Inside"],
            BOUNDARY_COLORS["Outside"]
          ]);
          map.setPaintProperty("tract-fill", "fill-opacity", 0.4);
        } else {
          map.setPaintProperty("tract-fill", "fill-color", "#e8e8e8");
          map.setPaintProperty("tract-fill", "fill-opacity", 0.3);
        }
      }
    };

    // Wait for map to be idle (tiles loaded) before applying paint properties
    if (map.isStyleLoaded() && map.getSource("census-tracts")) {
      doApply();
    } else {
      map.once('idle', doApply);
    }
  }, [currentMap, assessmentGeoids]);

  useEffect(() => {
    if (!mapLoaded) return;
    applychoropleth();
  }, [mapLoaded, applychoropleth, selectedYear]);

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
      paint: { "fill-color": "#e8e8e8", "fill-opacity": 0.4 },
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

    // Re-apply choropleth colors after source swap (wait for tiles to load)
    map.once('idle', () => applychoropleth());
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

  const captureMapAsPdf = async (idx: number): Promise<string> => {
    goToMap(idx);
    await new Promise(r => setTimeout(r, 1000));

    const map = mapRef.current;
    if (!map) throw new Error("Map not initialized");

    const area = mapAreaRef.current;
    if (!area) throw new Error("Map area not found");

    // Temporarily resize the map container to 2x for high-res capture
    const SCALE = 2;
    const origWidth  = area.offsetWidth;
    const origHeight = area.offsetHeight;
    area.style.width  = `${origWidth  * SCALE}px`;
    area.style.height = `${origHeight * SCALE}px`;
    map.resize();

    // Wait for map to re-render at new size
    await new Promise<void>(resolve => {
      map.once("idle", () => resolve());
      setTimeout(resolve, 3000);
    });
    await new Promise(r => setTimeout(r, 500));

    const glCanvas = map.getCanvas();
    const W = glCanvas.width;
    const H = glCanvas.height;

    // Capture overlays at same scale
    glCanvas.style.visibility = "hidden";
    const { toPng } = await import("html-to-image");
    const overlayDataUrl = await toPng(area, {
      pixelRatio: 1,
      skipFonts: true,
    });
    glCanvas.style.visibility = "visible";

    // Restore original size
    area.style.width  = "";
    area.style.height = "";
    map.resize();

    // Composite
    const overlayImg = new Image();
    await new Promise<void>(resolve => { overlayImg.onload = () => resolve(); overlayImg.src = overlayDataUrl; });

    const composite = document.createElement("canvas");
    composite.width  = W;
    composite.height = H;
    const ctx = composite.getContext("2d")!;
    ctx.drawImage(glCanvas, 0, 0);
    ctx.drawImage(overlayImg, 0, 0, W, H);

    return composite.toDataURL("image/jpeg", 1.0);
  };

  const buildPagePdf = async (idx: number, jsPDF: any): Promise<InstanceType<typeof jsPDF>> => {
    const imgData = await captureMapAsPdf(idx);
    const mapDef = MAPS[idx];

    const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "letter" });
    const PW = 279.4; const PH = 215.9;
    const margin = 8;

    pdf.setFontSize(13);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(30, 30, 30);
    pdf.text(mapDef.title, margin, margin + 5);

    pdf.setFontSize(8);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(100, 100, 100);
    const subtitle = `${selectedOrg?.name || "—"}  ·  Year: ${selectedYear}  ·  ${mapDef.description}`;
    pdf.text(subtitle, margin, margin + 10);

    pdf.setDrawColor(200, 200, 200);
    pdf.line(margin, margin + 13, PW - margin, margin + 13);

    const imgY = margin + 16;
    const imgH = PH - imgY - margin - 8;
    const imgW = PW - margin * 2;
    pdf.addImage(imgData, "JPEG", margin, imgY, imgW, imgH, undefined, "NONE");

    pdf.setFontSize(7);
    pdf.setTextColor(150, 150, 150);
    pdf.text("© Mapbox, © OpenStreetMap", margin, PH - 3);
    pdf.text("BankMaps CRA Assistant", PW - margin, PH - 3, { align: "right" });

    return pdf;
  };

  const handlePrintCurrent = async () => {
    setIsPdfLoading("current");
    try {
      const { default: jsPDF } = await import("jspdf");
      const pdf = await buildPagePdf(currentMapIdx, jsPDF);
      pdf.save(`${MAPS[currentMapIdx].title.replace(/\s+/g, "-").toLowerCase()}.pdf`);
    } catch (err: any) {
      console.error("[PDF]", err);
      alert("PDF generation failed: " + (err.message || "Unknown error"));
    } finally {
      setIsPdfLoading(null);
    }
  };

  const handlePrintAll = async () => {
    setIsPdfLoading("series");
    const originalIdx = currentMapIdx;
    try {
      const { default: jsPDF } = await import("jspdf");
      const { PDFDocument } = await import("pdf-lib");
      const merged = await PDFDocument.create();

      for (let i = 0; i < MAPS.length; i++) {
        const pdf = await buildPagePdf(i, jsPDF);
        const pageBytes = pdf.output("arraybuffer");
        const src = await PDFDocument.load(pageBytes);
        const [copied] = await merged.copyPages(src, [0]);
        merged.addPage(copied);
      }

      const bytes = await merged.save();
      const blob = new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "assessment-area-maps.pdf"; a.click();
      URL.revokeObjectURL(url);
      goToMap(originalIdx);
    } catch (err: any) {
      console.error("[PDF]", err);
      alert("PDF generation failed: " + (err.message || "Unknown error"));
    } finally {
      goToMap(originalIdx);
      setIsPdfLoading(null);
    }
  };
  // Notify Mapbox whenever the frame is resized so the canvas fills it
  useEffect(() => {
    if (!mapRef.current) return;
    setTimeout(() => mapRef.current?.resize(), 50);
  }, [frameDimensions]);

  useEffect(() => {
    if (!frameWrapperRef.current) return;
    const RATIO = 8.5 / 11;
    const measure = (el: Element) => {
      const w = el.clientWidth; const h = el.clientHeight;
// Drive by width first, then check if height fits
let fw = w;
let fh = fw * RATIO;
// If too tall, constrain by height instead
if (fh > h) { fh = h; fw = fh / RATIO; }

      setFrameDimensions({ width: Math.floor(fw), height: Math.floor(fh) });
    };
    measure(frameWrapperRef.current);
    const ro = new ResizeObserver(entries => entries.forEach(e => measure(e.target)));
    ro.observe(frameWrapperRef.current);
    return () => ro.disconnect();
  }, []);


  return (
    <>
      {/* ── Print styles ────────────────────────────────────────────────── */}
      <style>{`
        @media print {
          @page { size: landscape letter; margin: 0.4in; }
          body * { visibility: hidden; }
          .aa-print-frame, .aa-print-frame * { visibility: visible; }
          .aa-print-frame { position: fixed; top: 0; left: 0; width: 100%; max-width: 100%; }
          .aa-no-print { display: none !important; }
        }
      `}</style>

      {/* ── Card wrapper ─────────────────────────────────────────────────── */}
      <div className="flex flex-col rounded-xl border border-gray-200 shadow-sm overflow-hidden bg-white" style={{ fontFamily: "'Georgia', serif", height: "calc(100vh - 100px)" }}>

        {loading && (
          <div className="flex items-center justify-center flex-1">
            <p className="text-gray-500">Loading organizations...</p>
          </div>
        )}

        {!loading && organizations.length === 0 && (
          <div className="flex items-center justify-center flex-1">
            <p className="text-gray-500">No organizations found. Please create one first.</p>
          </div>
        )}

        {!loading && organizations.length > 0 && (
        <>
        {/* ── Card Header: Controls ─────────────────────────────────────── */}
        <div className="aa-no-print flex items-center gap-3 px-4 py-2 bg-white border-b border-gray-200 flex-wrap flex-shrink-0">

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
              const next = !showBoundary;
              setShowBoundary(next);
              const vis = next ? "visible" : "none";
              mapRef.current.setLayoutProperty("user-boundary-line", "visibility", vis);
              mapRef.current.setLayoutProperty("user-boundary-fill", "visibility", vis);
            }}
            className={`text-xs px-3 py-1 rounded-full border font-medium ${
              showBoundary
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-gray-600 border-gray-300 hover:border-gray-400"
            }`}
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
          {/* Print buttons */}
          <button
            onClick={handlePrintCurrent}
            disabled={isPdfLoading !== null}
            className="text-xs px-3 py-1 rounded-full border font-medium bg-white text-gray-600 border-gray-300 hover:border-gray-400 disabled:opacity-50"
          >
            {isPdfLoading === "current" ? "⏳ Generating..." : "🖨️ Print Current"}
          </button>
          <button
            onClick={handlePrintAll}
            disabled={isPdfLoading !== null}
            className="text-xs px-3 py-1 rounded-full border font-medium bg-white text-gray-600 border-gray-300 hover:border-gray-400 disabled:opacity-50"
          >
            {isPdfLoading === "series" ? "⏳ Generating..." : "🗂️ Print All"}
          </button>
        </div>

        {/* ── Print frame: full width, letter-landscape aspect ratio ───────── */}
        {/* ── Card Body: Map fills remaining space ─────────────────────── */}
        <div ref={frameWrapperRef} style={{ flex: 1, width: "100%", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", padding: "8px" }}>
        <div className="aa-print-frame" style={{ width: frameDimensions.width + 'px', border: '1px solid #ddd', boxShadow: '0 2px 12px rgba(0,0,0,0.10)', flexShrink: 0 }}>

        {/* ── Narrative Bar ─────────────────────────────────────────────── */}
        <div className={`px-6 py-3 bg-white border-b border-gray-100 ${isTransitioning ? "opacity-0" : "opacity-100"}`}>
          <h2 className="text-lg font-bold text-gray-800">{currentMap.title}</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {selectedOrg?.name || "—"} &nbsp;·&nbsp; Year: {selectedYear} &nbsp;·&nbsp; {currentMap.description}
          </p>
        </div>

        {/* ── Map Area: padding-bottom = 7.7/10.2 = 75.5% for landscape ─── */}
        <div
          ref={mapAreaRef}
          style={{ position: 'relative', width: '100%', height: (frameDimensions.height - 62) + 'px' }}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <div
            className="overflow-hidden"
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          >
          <div
            ref={mapContainerRef}
            style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }}
            className={isTransitioning ? "opacity-0" : "opacity-100"}
          />

          {/* Zoom controls - top left below title */}
          <div className="absolute top-3 left-3 z-10 flex flex-col gap-1">
            <button
              onClick={() => mapRef.current?.zoomIn()}
              className="w-7 h-7 bg-white rounded shadow text-lg font-bold text-gray-700 flex items-center justify-center hover:bg-gray-100 border border-gray-300"
              title="Zoom in"
            >+</button>
            <button
              onClick={() => mapRef.current?.zoomOut()}
              className="w-7 h-7 bg-white rounded shadow text-lg font-bold text-gray-700 flex items-center justify-center hover:bg-gray-100 border border-gray-300"
              title="Zoom out"
            >−</button>
          </div>

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

          {/* Branch legend - bottom right, above boundary legend */}
          {showBranches && branches.length > 0 && (
            <div className="absolute bg-white rounded-lg shadow-lg p-3 z-10 text-xs" style={{bottom:'52px', right:'56px'}}>
              <div className="font-semibold text-gray-700 mb-2">Branches</div>
              {branches.some((b: any) => b.branchtype === 11 || b.branchtype === '11') && (
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-3 h-3" style={{backgroundColor:'#cc0000'}} />
                  <span className="text-gray-600">Full Service Branch</span>
                </div>
              )}
            </div>
          )}

          {/* Blue boundary line legend - bottom right */}
          <div className="absolute bg-white rounded-lg shadow-lg p-3 z-10 text-xs" style={{bottom:'8px', right:'56px'}}>
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
          </div> {/* end inner absolute div */}
        </div> {/* end aspect ratio wrapper */}
        </div> {/* end aa-print-frame */}
        </div> {/* end frame wrapper */}

        {/* ── Card Footer: Slideshow Controls ──────────────────────────── */}
        <div className="aa-no-print flex items-center justify-center gap-3 px-4 py-3 bg-gray-50 border-t border-gray-200 flex-shrink-0">
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

import { useState, useEffect, useRef, useCallback } from "react";
import * as THREE from "three";

// ─── MOCK DATA ──────────────────────────────────────────────────────────────
const EVENTS = [
  {
    id: 1,
    title: "Black Sea Naval Escalation",
    location: { lat: 46.2, lng: 31.5, label: "Black Sea, Ukraine" },
    timestamp: "2026-03-26T14:22:00Z",
    summary:
      "Renewed drone strikes on naval infrastructure have disrupted grain corridor operations. Multiple vessels have altered course. NATO surveillance assets report increased Russian submarine activity near Bosphorus approaches.",
    developments: [
      "Three commercial vessels diverted from Odesa corridor",
      "NATO P-8 Poseidon recon flights increased to 6/day",
      "Turkish coast guard on elevated readiness",
      "Grain futures spiked 4.2% on Chicago exchange",
    ],
    confidence: "High",
    intensity: "red",
    scenarios: [
      {
        name: "Corridor Closure",
        probability: 38,
        description:
          "Full suspension of grain shipping corridor for 2–4 weeks, triggering food-price contagion in MENA.",
      },
      {
        name: "Negotiated Pause",
        probability: 45,
        description:
          "Back-channel ceasefire brokered via Turkey restores limited traffic within 72 hours.",
      },
      {
        name: "NATO Escort Protocol",
        probability: 17,
        description:
          "Alliance authorises armed escorts for flagged commercial vessels, risking direct confrontation.",
      },
    ],
    impact: {
      oil: "Up",
      sentiment: "Risk-off",
      sectors: ["Energy", "Shipping", "Defense"],
    },
  },
  {
    id: 2,
    title: "Strait of Hormuz Friction",
    location: { lat: 26.6, lng: 56.3, label: "Strait of Hormuz, Persian Gulf" },
    timestamp: "2026-03-25T08:11:00Z",
    summary:
      "IRGCN fast-boat harassment of a UK-flagged tanker has renewed pressure on insurance underwriters. Lloyd's of London war-risk premiums rose 120bps overnight. US 5th Fleet repositioned two destroyers.",
    developments: [
      "MV Hartwell Pioneer intercepted and boarded for 4 hours",
      "Lloyd's war-risk premiums +120bps overnight",
      "US 5th Fleet: USS Bulkeley & USS Cole repositioned",
      "Iran denied incident; claimed routine inspection",
    ],
    confidence: "High",
    intensity: "red",
    scenarios: [
      {
        name: "Escalatory Seizure",
        probability: 22,
        description:
          "Iran seizes another vessel, prompting US interdiction and potential closure of the strait.",
      },
      {
        name: "Diplomatic De-escalation",
        probability: 55,
        description:
          "Backchannel Oman-mediated talks produce a cooling period; tanker traffic normalises.",
      },
      {
        name: "Proxy Expansion",
        probability: 23,
        description:
          "Houthi drone coordination with IRGCN extends threat corridor into Red Sea.",
      },
    ],
    impact: {
      oil: "Up",
      sentiment: "Risk-off",
      sectors: ["Energy", "Shipping", "Defense"],
    },
  },
  {
    id: 3,
    title: "Taiwan Strait Air Incursions",
    location: { lat: 24.5, lng: 122.0, label: "Taiwan Strait, Indo-Pacific" },
    timestamp: "2026-03-24T22:45:00Z",
    summary:
      "PLAAF recorded 47 sorties crossing the median line in 48 hours—highest since 2022. Taiwan scrambled F-16Vs and activated ADIZ protocols. US Carrier Strike Group 11 conducting FONOP 120nm east of Taipei.",
    developments: [
      "47 PLAAF sorties crossed median line in 48h (record)",
      "Taiwan scrambled F-16Vs 14 times",
      "CSG-11 FONOP 120nm east of Taipei",
      "TSMC paused one fab shift as precaution",
    ],
    confidence: "Medium",
    intensity: "orange",
    scenarios: [
      {
        name: "Blockade Simulation",
        probability: 30,
        description:
          "PLA conducts live-fire exercises simulating blockade, stopping short of kinetic action.",
      },
      {
        name: "Status Quo Reassertion",
        probability: 50,
        description:
          "Activity subsides after political signal delivered; no structural change to cross-strait dynamics.",
      },
      {
        name: "Accidental Escalation",
        probability: 20,
        description:
          "Midair incident between PLAAF and ROCAF aircraft triggers crisis requiring rapid diplomatic management.",
      },
    ],
    impact: {
      oil: "Neutral",
      sentiment: "Risk-off",
      sectors: ["Tech", "Shipping", "Defense"],
    },
  },
  {
    id: 4,
    title: "Sahel Corridor Collapse",
    location: { lat: 15.5, lng: 2.1, label: "Mali–Niger Border, West Africa" },
    timestamp: "2026-03-23T11:30:00Z",
    summary:
      "Wagner-successor forces and JNIM militants clashed near Gao, displacing 40,000. French withdrawal vacuum has been partially filled by Russian instructors. AU peacekeeping mandate expires in 60 days with no renewal consensus.",
    developments: [
      "40,000 displaced near Gao after three-day battle",
      "Russian instructors confirmed at two FOBs",
      "AU MISAHEL mandate expires June 2026",
      "Uranium supply routes from Arlit disrupted",
    ],
    confidence: "Medium",
    intensity: "orange",
    scenarios: [
      {
        name: "Regional Spillover",
        probability: 40,
        description:
          "Violence spreads into Burkina Faso and Chad, triggering refugee flows into Libya and Algeria.",
      },
      {
        name: "Managed Fragmentation",
        probability: 45,
        description:
          "Rival factions establish de facto zones; humanitarian corridors negotiated through ICRC.",
      },
      {
        name: "External Intervention",
        probability: 15,
        description:
          "ECOWAS authorises military intervention backed by US logistics support.",
      },
    ],
    impact: {
      oil: "Neutral",
      sentiment: "Risk-off",
      sectors: ["Energy", "Defense"],
    },
  },
  {
    id: 5,
    title: "Kashmir LoC Skirmishes",
    location: { lat: 34.5, lng: 74.3, label: "Line of Control, Kashmir" },
    timestamp: "2026-03-22T06:00:00Z",
    summary:
      "Artillery exchanges along the LoC have intensified following a cross-border militant raid. Both India and Pakistan have moved additional armoured units to forward positions. SCO mediation offer declined by New Delhi.",
    developments: [
      "Artillery exchanges reported across 60km LoC stretch",
      "India moved 2 armoured brigades to forward positions",
      "Pakistan put air force on 30-min readiness",
      "SCO mediation offer rejected by New Delhi",
    ],
    confidence: "Medium",
    intensity: "orange",
    scenarios: [
      {
        name: "Limited Conventional Exchange",
        probability: 25,
        description:
          "Localised airstrikes similar to Balakot 2019; both sides manage escalation ladder carefully.",
      },
      {
        name: "De-escalation via Back-Channel",
        probability: 60,
        description:
          "UAE-brokered backchannel restores LoC quiet within 10 days.",
      },
      {
        name: "Crisis Spiral",
        probability: 15,
        description:
          "Miscalculation leads to broader conventional conflict with nuclear shadow in background.",
      },
    ],
    impact: {
      oil: "Up",
      sentiment: "Risk-off",
      sectors: ["Defense", "Energy"],
    },
  },
  {
    id: 6,
    title: "Myanmar Junta Fragmentation",
    location: { lat: 21.9, lng: 96.1, label: "Central Myanmar" },
    timestamp: "2026-03-21T18:00:00Z",
    summary:
      "Three resistance coalitions now control over 40% of Myanmar's territory. SAC air force has begun bombing runs on Mandalay suburbs. China has quietly repositioned border troops and closed two crossings.",
    developments: [
      "Resistance controls >40% of national territory",
      "SAC air strikes hit Mandalay residential districts",
      "China closed Muse and Chinshwehaw crossings",
      "Rare earth exports from Kachin State halted",
    ],
    confidence: "Low",
    intensity: "yellow",
    scenarios: [
      {
        name: "Junta Collapse",
        probability: 20,
        description:
          "SAC fractures; transitional authority struggles to control arms caches and border regions.",
      },
      {
        name: "Protracted Civil War",
        probability: 65,
        description:
          "Stalemate persists 18–24 months; regional powers hedge by backing different factions.",
      },
      {
        name: "Chinese Stabilisation",
        probability: 15,
        description:
          "Beijing brokers ceasefire to protect BRI corridor; installs a more compliant government.",
      },
    ],
    impact: {
      oil: "Neutral",
      sentiment: "Risk-off",
      sectors: ["Tech", "Shipping"],
    },
  },
  {
    id: 7,
    title: "Venezuela–Guyana Border Standoff",
    location: { lat: 6.8, lng: -61.2, label: "Essequibo Region, South America" },
    timestamp: "2026-03-20T14:00:00Z",
    summary:
      "Venezuela has moved mechanised infantry to the Essequibo border following Exxon's new deepwater discovery. Guyana has invoked CARICOM Article 7 and requested US Coast Guard presence. Offshore production at Stabroek Block briefly suspended.",
    developments: [
      "Venezuelan mechanised infantry at Cuyuní river crossings",
      "Guyana invoked CARICOM mutual defence clause",
      "ExxonMobil suspended Stabroek Block drilling 36 hours",
      "SOUTHCOM increased aerial ISR coverage",
    ],
    confidence: "Low",
    intensity: "yellow",
    scenarios: [
      {
        name: "Oil Field Intimidation",
        probability: 50,
        description:
          "Venezuela uses military pressure to extract concessions from Exxon; no territorial incursion.",
      },
      {
        name: "Incursion & International Response",
        probability: 20,
        description:
          "Limited territorial crossing triggers OAS emergency session and US sanctions escalation.",
      },
      {
        name: "ICJ Injunction",
        probability: 30,
        description:
          "ICJ issues interim order; both sides stand down pending 18-month ruling.",
      },
    ],
    impact: {
      oil: "Up",
      sentiment: "Risk-on",
      sectors: ["Energy", "Defense"],
    },
  },
];

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const latLngToVec3 = (lat, lng, r = 1.01) => {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta)
  );
};

const intensityColor = { red: "#ef4444", orange: "#f97316", yellow: "#eab308" };
const intensityGlow = { red: "#ff000088", orange: "#ff730088", yellow: "#ffdd0088" };

const fmtDate = (iso) => {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) +
    " · " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) + " UTC";
};

const BACKEND_EVENTS_PATH = "/api/v1/events?limit=50";

function resolveBackendUrl(path) {
  if (typeof window === "undefined") return path;
  if (window.__GRIGORI_API_BASE) {
    return `${window.__GRIGORI_API_BASE}${path}`;
  }
  return path;
}

function mapToneToPanelIntensity(tone, confidence) {
  if (tone === "Escalating" && confidence === "High") return "red";
  if (tone === "Escalating") return "orange";
  if (confidence === "High") return "orange";
  return "yellow";
}

function mapBackendEvent(event) {
  const location = event.location ?? { label: "Unknown Region", lat: null, lng: null };
  const primaryImpact = event.scenarios?.[0]?.impact ?? {};

  return {
    id: event.id,
    title: event.title ?? "Untitled Event",
    location,
    timestamp: event.timestamp ?? new Date().toISOString(),
    summary: event.summary ?? "",
    developments: event.developments ?? [],
    confidence: event.confidence ?? "Low",
    tone: event.tone ?? "Stable",
    intensity: mapToneToPanelIntensity(event.tone, event.confidence),
    scenarios: (event.scenarios ?? []).map((scenario) => ({
      name: scenario.name ?? "Base Case",
      probability: scenario.probability ?? 100,
      description: scenario.description ?? "",
    })),
    impact: {
      oil: primaryImpact.oil ?? "Neutral",
      sentiment: primaryImpact.sentiment ?? primaryImpact.markets ?? "Stable",
      sectors: primaryImpact.sectors ?? [],
    },
  };
}

// ─── GLOBE ───────────────────────────────────────────────────────────────────
function Globe({ events, selectedId, onSelect, focusLat, focusLng }) {
  const mountRef = useRef(null);
  const sceneRef = useRef({});

  useEffect(() => {
    const W = mountRef.current.clientWidth;
    const H = mountRef.current.clientHeight;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(W, H);
    mountRef.current.appendChild(renderer.domElement);

    // Scene / Camera
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 100);
    camera.position.set(0, 0, 2.8);

    // Lights
    const ambient = new THREE.AmbientLight(0x1a2a4a, 2.5);
    scene.add(ambient);
    const dirLight = new THREE.DirectionalLight(0x4488ff, 2);
    dirLight.position.set(5, 3, 5);
    scene.add(dirLight);
    const rimLight = new THREE.DirectionalLight(0x00ccff, 0.8);
    rimLight.position.set(-5, -2, -3);
    scene.add(rimLight);

    // Globe sphere
    const geo = new THREE.SphereGeometry(1, 64, 64);

    // Canvas texture for grid
    const texCanvas = document.createElement("canvas");
    texCanvas.width = 2048; texCanvas.height = 1024;
    const ctx = texCanvas.getContext("2d");

    // Deep ocean base
    const oceanGrad = ctx.createRadialGradient(1024, 512, 0, 1024, 512, 1024);
    oceanGrad.addColorStop(0, "#0a1628");
    oceanGrad.addColorStop(1, "#050d1a");
    ctx.fillStyle = oceanGrad;
    ctx.fillRect(0, 0, 2048, 1024);

    // Lat/lng grid
    ctx.strokeStyle = "rgba(0,180,255,0.08)";
    ctx.lineWidth = 1;
    for (let lat = -90; lat <= 90; lat += 15) {
      const y = ((90 - lat) / 180) * 1024;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(2048, y); ctx.stroke();
    }
    for (let lng = -180; lng <= 180; lng += 15) {
      const x = ((lng + 180) / 360) * 2048;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 1024); ctx.stroke();
    }

    // Equator highlight
    ctx.strokeStyle = "rgba(0,200,255,0.18)";
    ctx.lineWidth = 1.5;
    const eqY = 512;
    ctx.beginPath(); ctx.moveTo(0, eqY); ctx.lineTo(2048, eqY); ctx.stroke();

    const texture = new THREE.CanvasTexture(texCanvas);
    const mat = new THREE.MeshPhongMaterial({
      map: texture,
      specular: new THREE.Color(0x224466),
      shininess: 60,
      transparent: true,
      opacity: 0.95,
    });
    const globe = new THREE.Mesh(geo, mat);
    scene.add(globe);

    // Atmosphere glow (shell)
    const atmGeo = new THREE.SphereGeometry(1.06, 64, 64);
    const atmMat = new THREE.MeshPhongMaterial({
      color: 0x0044aa,
      transparent: true,
      opacity: 0.07,
      side: THREE.FrontSide,
    });
    scene.add(new THREE.Mesh(atmGeo, atmMat));

    // Outer corona
    const coronaGeo = new THREE.SphereGeometry(1.12, 64, 64);
    const coronaMat = new THREE.MeshBasicMaterial({
      color: 0x002244,
      transparent: true,
      opacity: 0.04,
      side: THREE.FrontSide,
    });
    scene.add(new THREE.Mesh(coronaGeo, coronaMat));

    // Hotspots
    const hotspotGroup = new THREE.Group();
    scene.add(hotspotGroup);

    const hotspotMeshes = [];
    events.forEach((ev) => {
      const pos = latLngToVec3(ev.location.lat, ev.location.lng);
      const color = new THREE.Color(intensityColor[ev.intensity]);

      // Ping disc
      const ringGeo = new THREE.RingGeometry(0.012, 0.022, 32);
      const ringMat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.copy(pos);
      ring.lookAt(0, 0, 0);
      hotspotGroup.add(ring);

      // Core dot
      const dotGeo = new THREE.CircleGeometry(0.009, 24);
      const dotMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, side: THREE.DoubleSide });
      const dot = new THREE.Mesh(dotGeo, dotMat);
      dot.position.copy(pos);
      dot.lookAt(0, 0, 0);
      dot.userData = { eventId: ev.id };
      hotspotGroup.add(dot);
      hotspotMeshes.push(dot);

      // Outer pulse ring (animated)
      const pulseGeo = new THREE.RingGeometry(0.024, 0.028, 32);
      const pulseMat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.3 });
      const pulse = new THREE.Mesh(pulseGeo, pulseMat);
      pulse.position.copy(pos);
      pulse.lookAt(0, 0, 0);
      pulse.userData = { isPulse: true, baseOpacity: 0.3 };
      hotspotGroup.add(pulse);
    });

    sceneRef.current = { renderer, scene, camera, globe, hotspotGroup, hotspotMeshes };

    // Mouse interaction
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let isDragging = false;
    let prevMouse = { x: 0, y: 0 };
    let rotVel = { x: 0, y: 0 };
    let targetRot = { x: 0, y: 0 };
    let currentRot = { x: 0, y: 0 };

    const onMouseDown = (e) => {
      isDragging = true;
      prevMouse = { x: e.clientX, y: e.clientY };
      rotVel = { x: 0, y: 0 };
    };
    const onMouseMove = (e) => {
      if (!isDragging) return;
      const dx = e.clientX - prevMouse.x;
      const dy = e.clientY - prevMouse.y;
      rotVel.x = dy * 0.003;
      rotVel.y = dx * 0.003;
      targetRot.x += dy * 0.003;
      targetRot.y += dx * 0.003;
      prevMouse = { x: e.clientX, y: e.clientY };
    };
    const onMouseUp = (e) => {
      isDragging = false;
      const rect = mountRef.current.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(hotspotMeshes);
      if (hits.length > 0) {
        onSelect(hits[0].object.userData.eventId);
      }
    };

    renderer.domElement.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    // Touch support
    renderer.domElement.addEventListener("touchstart", (e) => {
      const t = e.touches[0];
      isDragging = true;
      prevMouse = { x: t.clientX, y: t.clientY };
    });
    renderer.domElement.addEventListener("touchmove", (e) => {
      e.preventDefault();
      const t = e.touches[0];
      if (!isDragging) return;
      const dx = t.clientX - prevMouse.x;
      const dy = t.clientY - prevMouse.y;
      targetRot.x += dy * 0.003;
      targetRot.y += dx * 0.003;
      prevMouse = { x: t.clientX, y: t.clientY };
    }, { passive: false });
    renderer.domElement.addEventListener("touchend", () => { isDragging = false; });

    // Animation loop
    let frame;
    const clock = new THREE.Clock();
    const animate = () => {
      frame = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();

      if (!isDragging) {
        rotVel.y *= 0.95;
        targetRot.y += 0.0012; // auto-rotate
      }
      currentRot.x += (targetRot.x - currentRot.x) * 0.08;
      currentRot.y += (targetRot.y - currentRot.y) * 0.08;
      globe.rotation.x = currentRot.x;
      globe.rotation.y = currentRot.y;
      hotspotGroup.rotation.x = currentRot.x;
      hotspotGroup.rotation.y = currentRot.y;

      // Pulse animation
      hotspotGroup.children.forEach((m) => {
        if (m.userData.isPulse) {
          const s = 1 + 0.4 * Math.sin(t * 2.5 + m.position.x * 10);
          m.scale.set(s, s, 1);
          m.material.opacity = m.userData.baseOpacity * (1 - 0.5 * Math.abs(Math.sin(t * 2.5)));
        }
      });

      renderer.render(scene, camera);
    };
    animate();

    // Resize
    const onResize = () => {
      const w = mountRef.current.clientWidth;
      const h = mountRef.current.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(frame);
      renderer.domElement.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      if (mountRef.current) mountRef.current.removeChild(renderer.domElement);
    };
  }, []);

  // Focus globe on event
  useEffect(() => {
    if (focusLat === null || focusLng === null) return;
    const { globe, hotspotGroup } = sceneRef.current;
    if (!globe) return;
    const targetY = -focusLng * (Math.PI / 180) - Math.PI;
    const targetX = -focusLat * (Math.PI / 180) * 0.5;
    globe.rotation.y = targetY;
    globe.rotation.x = targetX;
    hotspotGroup.rotation.y = targetY;
    hotspotGroup.rotation.x = targetX;
  }, [focusLat, focusLng]);

  return (
    <div ref={mountRef} className="w-full h-full" style={{ cursor: "grab" }} />
  );
}

// ─── COMPONENTS ──────────────────────────────────────────────────────────────

function ConfidenceBadge({ level }) {
  const colors = { High: "#22c55e", Medium: "#eab308", Low: "#94a3b8" };
  return (
    <span style={{
      background: colors[level] + "22",
      color: colors[level],
      border: `1px solid ${colors[level]}55`,
      borderRadius: 3,
      padding: "2px 9px",
      fontSize: 11,
      fontFamily: "monospace",
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      fontWeight: 700,
    }}>
      {level}
    </span>
  );
}

function OilArrow({ dir }) {
  if (dir === "Up") return <span style={{ color: "#ef4444", fontWeight: 800, fontSize: 15 }}>▲ Up</span>;
  if (dir === "Down") return <span style={{ color: "#22c55e", fontWeight: 800, fontSize: 15 }}>▼ Down</span>;
  return <span style={{ color: "#94a3b8", fontWeight: 700, fontSize: 15 }}>— Neutral</span>;
}

function SentimentChip({ s }) {
  const ro = s === "Risk-off";
  return (
    <span style={{
      background: ro ? "#ef444422" : "#22c55e22",
      color: ro ? "#ef4444" : "#22c55e",
      border: `1px solid ${ro ? "#ef444455" : "#22c55e55"}`,
      borderRadius: 3,
      padding: "2px 9px",
      fontSize: 11,
      fontFamily: "monospace",
      fontWeight: 700,
      textTransform: "uppercase",
      letterSpacing: "0.07em",
    }}>{s}</span>
  );
}

function SectorTag({ name }) {
  return (
    <span style={{
      background: "#1e3a5f",
      color: "#7dd3fc",
      border: "1px solid #1e4a7f",
      borderRadius: 3,
      padding: "2px 8px",
      fontSize: 10,
      fontFamily: "monospace",
      fontWeight: 600,
      textTransform: "uppercase",
      letterSpacing: "0.06em",
    }}>{name}</span>
  );
}

function ProbBar({ val }) {
  const color = val >= 50 ? "#22c55e" : val >= 30 ? "#eab308" : "#ef4444";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 4, background: "#1e293b", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ width: `${val}%`, height: "100%", background: color, borderRadius: 2, transition: "width 0.6s ease" }} />
      </div>
      <span style={{ color, fontFamily: "monospace", fontSize: 12, fontWeight: 700, minWidth: 34 }}>{val}%</span>
    </div>
  );
}

function EventPanel({ event, onClose }) {
  const [activeScenario, setActiveScenario] = useState(0);
  if (!event) return null;
  const sc = event.scenarios[activeScenario];

  return (
    <div style={{
      position: "absolute", right: 0, top: 0, bottom: 0, width: 420,
      background: "linear-gradient(160deg, #060e1e 0%, #0a1628 100%)",
      borderLeft: "1px solid #1e3a5f",
      display: "flex", flexDirection: "column",
      zIndex: 30,
      animation: "slideIn 0.35s cubic-bezier(0.23, 1, 0.32, 1)",
      overflowY: "auto",
    }}>
      {/* Header */}
      <div style={{ padding: "22px 24px 16px", borderBottom: "1px solid #0f2040" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ flex: 1, marginRight: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: intensityColor[event.intensity], display: "inline-block", boxShadow: `0 0 8px ${intensityColor[event.intensity]}` }} />
              <span style={{ color: "#64748b", fontSize: 10, fontFamily: "monospace", letterSpacing: "0.15em", textTransform: "uppercase" }}>ACTIVE ALERT</span>
            </div>
            <h2 style={{ color: "#e2e8f0", fontSize: 16, fontWeight: 700, lineHeight: 1.3, fontFamily: "'Space Mono', monospace", margin: 0 }}>{event.title}</h2>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "1px solid #1e3a5f", color: "#475569", cursor: "pointer", width: 28, height: 28, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>✕</button>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 12, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ color: "#38bdf8", fontSize: 11, fontFamily: "monospace" }}>📍 {event.location.label}</span>
          <span style={{ color: "#334155", fontSize: 11 }}>·</span>
          <span style={{ color: "#475569", fontSize: 11, fontFamily: "monospace" }}>{fmtDate(event.timestamp)}</span>
          <ConfidenceBadge level={event.confidence} />
        </div>
      </div>

      {/* Summary */}
      <div style={{ padding: "18px 24px", borderBottom: "1px solid #0f2040" }}>
        <div style={{ color: "#334155", fontSize: 10, fontFamily: "monospace", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8 }}>INTEL SUMMARY</div>
        <p style={{ color: "#94a3b8", fontSize: 13, lineHeight: 1.65, margin: 0 }}>{event.summary}</p>
      </div>

      {/* Developments */}
      <div style={{ padding: "18px 24px", borderBottom: "1px solid #0f2040" }}>
        <div style={{ color: "#334155", fontSize: 10, fontFamily: "monospace", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 10 }}>KEY DEVELOPMENTS</div>
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 7 }}>
          {event.developments.map((d, i) => (
            <li key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <span style={{ color: "#38bdf8", fontFamily: "monospace", fontSize: 11, marginTop: 1, flexShrink: 0 }}>▸</span>
              <span style={{ color: "#94a3b8", fontSize: 12, lineHeight: 1.55 }}>{d}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Scenarios */}
      <div style={{ padding: "18px 24px", borderBottom: "1px solid #0f2040" }}>
        <div style={{ color: "#334155", fontSize: 10, fontFamily: "monospace", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 12 }}>SCENARIO ENGINE</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {event.scenarios.map((sc, i) => (
            <div key={i} onClick={() => setActiveScenario(i)} style={{
              background: activeScenario === i ? "#0f2040" : "#060e1e",
              border: `1px solid ${activeScenario === i ? "#1e4a7f" : "#0f2040"}`,
              borderRadius: 6, padding: "10px 14px", cursor: "pointer",
              transition: "all 0.2s ease",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ color: activeScenario === i ? "#e2e8f0" : "#64748b", fontSize: 12, fontWeight: 700, fontFamily: "'Space Mono', monospace" }}>{sc.name}</span>
              </div>
              <ProbBar val={sc.probability} />
              {activeScenario === i && (
                <p style={{ color: "#64748b", fontSize: 12, margin: "8px 0 0", lineHeight: 1.55 }}>{sc.description}</p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Impact */}
      <div style={{ padding: "18px 24px" }}>
        <div style={{ color: "#334155", fontSize: 10, fontFamily: "monospace", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 12 }}>MARKET IMPACT</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
          <div style={{ background: "#060e1e", border: "1px solid #0f2040", borderRadius: 6, padding: "10px 14px" }}>
            <div style={{ color: "#334155", fontSize: 9, fontFamily: "monospace", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 5 }}>OIL</div>
            <OilArrow dir={event.impact.oil} />
          </div>
          <div style={{ background: "#060e1e", border: "1px solid #0f2040", borderRadius: 6, padding: "10px 14px" }}>
            <div style={{ color: "#334155", fontSize: 9, fontFamily: "monospace", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 5 }}>SENTIMENT</div>
            <SentimentChip s={event.impact.sentiment} />
          </div>
        </div>
        <div style={{ background: "#060e1e", border: "1px solid #0f2040", borderRadius: 6, padding: "10px 14px" }}>
          <div style={{ color: "#334155", fontSize: 9, fontFamily: "monospace", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8 }}>AFFECTED SECTORS</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {event.impact.sectors.map((s, i) => <SectorTag key={i} name={s} />)}
          </div>
        </div>
      </div>
    </div>
  );
}

function NewsFeed({ events, selectedId, onSelect }) {
  return (
    <div style={{
      position: "absolute", left: 0, top: 0, bottom: 0, width: 300,
      background: "linear-gradient(160deg, #060e1e 0%, #0a1628 100%)",
      borderRight: "1px solid #1e3a5f",
      display: "flex", flexDirection: "column",
      zIndex: 20,
    }}>
      <div style={{ padding: "20px 20px 14px", borderBottom: "1px solid #0f2040" }}>
        <div style={{ color: "#334155", fontSize: 9, fontFamily: "monospace", letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 4 }}>ACTIVE CONFLICTS</div>
        <div style={{ color: "#38bdf8", fontSize: 11, fontFamily: "monospace" }}>{events.length} EVENTS TRACKED</div>
      </div>
      <div style={{ flex: 1, overflowY: "auto" }}>
        {events.map((ev) => (
          <div key={ev.id} onClick={() => onSelect(ev.id)} style={{
            padding: "14px 20px",
            borderBottom: "1px solid #0a1628",
            cursor: "pointer",
            background: selectedId === ev.id ? "#0f2040" : "transparent",
            borderLeft: `3px solid ${selectedId === ev.id ? intensityColor[ev.intensity] : "transparent"}`,
            transition: "all 0.2s ease",
          }}
          onMouseEnter={e => { if (selectedId !== ev.id) e.currentTarget.style.background = "#080f1e"; }}
          onMouseLeave={e => { if (selectedId !== ev.id) e.currentTarget.style.background = "transparent"; }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: intensityColor[ev.intensity], flexShrink: 0, boxShadow: `0 0 6px ${intensityColor[ev.intensity]}` }} />
              <span style={{ color: "#64748b", fontSize: 9, fontFamily: "monospace", letterSpacing: "0.1em", textTransform: "uppercase" }}>{ev.intensity} SEVERITY</span>
            </div>
            <div style={{ color: selectedId === ev.id ? "#e2e8f0" : "#94a3b8", fontSize: 12, fontWeight: 600, lineHeight: 1.4, marginBottom: 5, fontFamily: "'Space Mono', monospace" }}>{ev.title}</div>
            <div style={{ color: "#334155", fontSize: 10, fontFamily: "monospace" }}>{ev.location.label}</div>
            <div style={{ color: "#1e3a5f", fontSize: 10, fontFamily: "monospace", marginTop: 3 }}>{fmtDate(ev.timestamp)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TopBar() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div style={{
      position: "absolute", top: 0, left: 300, right: 0,
      height: 52,
      background: "linear-gradient(90deg, #060e1eee 0%, #08142aee 100%)",
      borderBottom: "1px solid #1e3a5f",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "0 28px",
      zIndex: 25,
      backdropFilter: "blur(8px)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 24, height: 24, background: "linear-gradient(135deg, #1e40af, #0ea5e9)", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>◈</div>
          <span style={{ color: "#e2e8f0", fontFamily: "'Space Mono', monospace", fontSize: 15, fontWeight: 700, letterSpacing: "0.06em" }}>GRIGORI</span>
          <span style={{ color: "#1e3a5f", fontSize: 13 }}>·</span>
          <span style={{ color: "#334155", fontFamily: "monospace", fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase" }}>Geopolitical Watch System</span>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <span style={{ background: "#22c55e22", color: "#22c55e", border: "1px solid #22c55e44", borderRadius: 3, padding: "2px 8px", fontSize: 9, fontFamily: "monospace", letterSpacing: "0.1em" }}>● LIVE</span>
          <span style={{ background: "#1e3a5f33", color: "#38bdf8", border: "1px solid #1e3a5f", borderRadius: 3, padding: "2px 8px", fontSize: 9, fontFamily: "monospace", letterSpacing: "0.1em" }}>v2.6.1</span>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <div style={{ color: "#334155", fontSize: 10, fontFamily: "monospace", letterSpacing: "0.1em" }}>
          <span style={{ color: "#475569" }}>UTC </span>
          <span style={{ color: "#64748b" }}>{time.toISOString().slice(11, 19)}</span>
        </div>
        <div style={{ color: "#1e3a5f", fontSize: 13 }}>|</div>
        <div style={{ display: "flex", gap: 12 }}>
          {[["RED", 2, "#ef4444"], ["ORANGE", 2, "#f97316"], ["YELLOW", 3, "#eab308"]].map(([label, count, color]) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, display: "inline-block" }} />
              <span style={{ color: "#334155", fontSize: 9, fontFamily: "monospace", letterSpacing: "0.1em" }}>{label}: {count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── APP ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [events, setEvents] = useState(EVENTS);
  const [selectedId, setSelectedId] = useState(null);
  const [focusCoords, setFocusCoords] = useState({ lat: null, lng: null });

  useEffect(() => {
    let cancelled = false;

    async function loadEvents() {
      try {
        const res = await fetch(resolveBackendUrl(BACKEND_EVENTS_PATH), {
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) return;

        const data = await res.json();
        if (!cancelled && Array.isArray(data.events) && data.events.length > 0) {
          setEvents(data.events.map(mapBackendEvent));
        }
      } catch {
        // Keep static fallback data when the backend is unavailable.
      }
    }

    loadEvents();
    const interval = setInterval(loadEvents, 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const selectedEvent = events.find((e) => e.id === selectedId) || null;

  const handleSelect = useCallback((id) => {
    const ev = events.find((e) => e.id === id);
    if (ev) {
      setSelectedId(id);
      setFocusCoords({ lat: ev.location.lat, lng: ev.location.lng });
    }
  }, [events]);

  const handleClose = useCallback(() => setSelectedId(null), []);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #030912; overflow: hidden; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #060e1e; }
        ::-webkit-scrollbar-thumb { background: #1e3a5f; border-radius: 2px; }
        @keyframes slideIn {
          from { transform: translateX(30px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes fadeIn {
          from { opacity: 0; } to { opacity: 1; }
        }
      `}</style>

      <div style={{ width: "100vw", height: "100vh", position: "relative", overflow: "hidden" }}>
        {/* Background grid */}
        <div style={{
          position: "absolute", inset: 0, zIndex: 0,
          backgroundImage: `
            linear-gradient(rgba(0,180,255,0.025) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,180,255,0.025) 1px, transparent 1px)
          `,
          backgroundSize: "60px 60px",
          animation: "fadeIn 2s ease",
        }} />

        {/* Globe canvas area */}
        <div style={{
          position: "absolute",
          left: 300,
          right: selectedEvent ? 420 : 0,
          top: 52,
          bottom: 0,
          transition: "right 0.35s cubic-bezier(0.23, 1, 0.32, 1)",
        }}>
          <Globe
            events={events}
            selectedId={selectedId}
            onSelect={handleSelect}
            focusLat={focusCoords.lat}
            focusLng={focusCoords.lng}
          />

          {/* Globe overlay instructions */}
          {!selectedEvent && (
            <div style={{
              position: "absolute", bottom: 28, left: "50%", transform: "translateX(-50%)",
              color: "#1e3a5f", fontSize: 10, fontFamily: "monospace", letterSpacing: "0.12em",
              textTransform: "uppercase", textAlign: "center",
              animation: "fadeIn 2s ease 1s both",
            }}>
              DRAG TO ROTATE · CLICK HOTSPOT TO ANALYSE
            </div>
          )}

          {/* Corner decorations */}
          {["tl", "tr", "bl", "br"].map((c) => (
            <div key={c} style={{
              position: "absolute",
              top: c.startsWith("t") ? 16 : "auto",
              bottom: c.startsWith("b") ? 16 : "auto",
              left: c.endsWith("l") ? 16 : "auto",
              right: c.endsWith("r") ? 16 : "auto",
              width: 20, height: 20,
              borderTop: c.startsWith("t") ? "1px solid #1e3a5f" : "none",
              borderBottom: c.startsWith("b") ? "1px solid #1e3a5f" : "none",
              borderLeft: c.endsWith("l") ? "1px solid #1e3a5f" : "none",
              borderRight: c.endsWith("r") ? "1px solid #1e3a5f" : "none",
            }} />
          ))}
        </div>

        <TopBar />
        <NewsFeed events={events} selectedId={selectedId} onSelect={handleSelect} />
        {selectedEvent && <EventPanel event={selectedEvent} onClose={handleClose} />}
      </div>
    </>
  );
}

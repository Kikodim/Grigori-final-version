import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import ClassicApp from "../grigori.jsx";
import GlobeApp from "../grigori-globe.jsx";
import { BRAND } from "../premium-config.js";
import ReportsApp from "./reports.jsx";

const VIEW_CONFIG = {
  globe: {
    label: "Globe",
    path: "/",
    title: BRAND.pageTitle,
    description: BRAND.description,
  },
  classic: {
    label: "Intel Board",
    path: "/intel-board",
    title: `${BRAND.pageTitle} | Intel Board`,
    description: BRAND.description,
  },
  reports: {
    label: "Personalized Reports",
    path: "/reports",
    title: `${BRAND.pageTitle} | Personalized Reports`,
    description: BRAND.description,
  },
};

function pathToView(pathname) {
  if (pathname === "/reports") return "reports";
  if (pathname === "/intel-board" || pathname === "/classic") return "classic";
  return "globe";
}

function setMeta(name, value) {
  let tag = document.querySelector(`meta[name="${name}"]`);
  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute("name", name);
    document.head.appendChild(tag);
  }
  tag.setAttribute("content", value);
}

function setPropertyMeta(name, value) {
  let tag = document.querySelector(`meta[property="${name}"]`);
  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute("property", name);
    document.head.appendChild(tag);
  }
  tag.setAttribute("content", value);
}

function Shell() {
  const [view, setView] = useState(() => pathToView(window.location.pathname));

  useEffect(() => {
    const onPopState = () => setView(pathToView(window.location.pathname));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    const config = VIEW_CONFIG[view];
    document.title = config.title;
    setMeta("description", config.description);
    setMeta("title", config.title);
    setPropertyMeta("og:title", config.title);
    setPropertyMeta("og:description", config.description);
  }, [view]);

  const ActiveView = useMemo(() => {
    if (view === "classic") return ClassicApp;
    if (view === "reports") return ReportsApp;
    return GlobeApp;
  }, [view]);

  const navigate = (nextView) => {
    const target = VIEW_CONFIG[nextView];
    if (!target) return;
    window.history.pushState({}, "", target.path);
    setView(nextView);
  };

  return (
    <div style={{ width: "100%", height: "100%", position: "relative", overflowY: view === "globe" ? "hidden" : "auto", overflowX: "hidden" }}>
      <div
        style={{
          position: "fixed",
          top: 14,
          right: 14,
          zIndex: 3000,
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "10px 12px",
          background: "rgba(2, 8, 20, 0.68)",
          border: "1px solid rgba(71, 85, 105, 0.42)",
          borderRadius: 16,
          backdropFilter: "blur(16px)",
        }}
      >
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {Object.entries(VIEW_CONFIG).map(([key, config]) => (
            <button
              key={key}
              onClick={() => navigate(key)}
              style={{
                border: `1px solid ${view === key ? "rgba(125, 211, 252, 0.38)" : "rgba(71, 85, 105, 0.42)"}`,
                borderRadius: 999,
                padding: "10px 14px",
                background: view === key ? "rgba(56, 189, 248, 0.12)" : "rgba(15, 23, 42, 0.72)",
                color: "#e2e8f0",
                cursor: "pointer",
                fontFamily: "monospace",
                fontSize: 11,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              {config.label}
            </button>
          ))}
        </div>
      </div>
      <ActiveView key={view} />
      <div style={{
        position: "fixed",
        right: 16,
        bottom: 12,
        zIndex: 2500,
        color: "rgba(148,163,184,0.72)",
        fontSize: 11,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        fontFamily: "monospace",
        pointerEvents: "none",
      }}>
        Built by oryth.io
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<Shell />);

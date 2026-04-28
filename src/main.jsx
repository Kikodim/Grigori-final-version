import { useEffect, useState } from "react";
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
  const [isCompact, setIsCompact] = useState(() => (typeof window !== "undefined" ? window.innerWidth < 768 : false));

  useEffect(() => {
    const onPopState = () => setView(pathToView(window.location.pathname));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    const onResize = () => setIsCompact(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const config = VIEW_CONFIG[view];
    document.title = config.title;
    setMeta("description", config.description);
    setMeta("title", config.title);
    setPropertyMeta("og:title", config.title);
    setPropertyMeta("og:description", config.description);
  }, [view]);

  const navigate = (nextView) => {
    const target = VIEW_CONFIG[nextView];
    if (!target) return;
    window.history.pushState({}, "", target.path);
    setView(nextView);
  };

  const ActiveView = view === "classic" ? ClassicApp : view === "reports" ? ReportsApp : GlobeApp;

  return (
    <div style={{ width: "100%", height: "100%", position: "relative", overflowY: view === "globe" ? "hidden" : "auto", overflowX: "hidden" }}>
      <ActiveView key={view} activeView={view} onNavigate={navigate} />
      <div style={{
        position: "fixed",
        right: isCompact ? 12 : 18,
        left: isCompact ? 12 : "auto",
        bottom: isCompact ? "calc(env(safe-area-inset-bottom, 0px) + 10px)" : "calc(env(safe-area-inset-bottom, 0px) + 14px)",
        zIndex: 2500,
        color: "rgba(148,163,184,0.68)",
        fontSize: isCompact ? 9 : 10,
        letterSpacing: isCompact ? "0.12em" : "0.18em",
        textTransform: "uppercase",
        fontFamily: "'Share Tech Mono', 'IBM Plex Mono', monospace",
        pointerEvents: "none",
        padding: isCompact ? "8px 10px" : "8px 12px",
        borderRadius: 999,
        background: "rgba(3, 9, 22, 0.62)",
        border: "1px solid rgba(86, 146, 180, 0.18)",
        backdropFilter: "blur(14px)",
        textAlign: "center",
        whiteSpace: isCompact ? "normal" : "nowrap",
        maxWidth: isCompact ? "calc(100vw - 24px)" : "min(78vw, 560px)",
        lineHeight: 1.45,
      }}>
        Built by oryth.io · Open-source intelligence signals. Not financial advice.
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<Shell />);

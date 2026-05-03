import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import ClassicApp from "../grigori.jsx";
import GlobeApp from "../grigori-globe.jsx";
import { BRAND } from "../premium-config.js";
import ReportsApp from "./reports.jsx";
import SeoLandingPage, { DEFAULT_META, getSeoRouteConfig, SITE_ORIGIN } from "./seo-pages.jsx";

const VIEW_CONFIG = {
  globe: {
    label: "Globe",
    path: "/",
    title: DEFAULT_META.title,
    description: DEFAULT_META.description,
  },
  classic: {
    label: "Intel Board",
    path: "/intel",
    title: `${BRAND.pageTitle} | Intel Board`,
    description: "Analyst-style event review, scenario framing, source transparency, and geopolitical signal triage across Grigori’s Intel Board.",
  },
  reports: {
    label: "Personalized Reports",
    path: "/reports",
    title: `${BRAND.pageTitle} | Personalized Reports`,
    description: "Preview personalized intelligence reports, executive briefs, and early-access reporting workflows powered by Grigori’s live geopolitical dashboard.",
  },
};

function getRouteConfig(pathname) {
  const seoConfig = getSeoRouteConfig(pathname);
  if (seoConfig) {
    return {
      view: "seo",
      path: pathname,
      title: seoConfig.title,
      description: seoConfig.description,
      canonical: `${SITE_ORIGIN}${pathname}`,
      type: "website",
      structuredData: {
        "@context": "https://schema.org",
        "@type": "WebApplication",
        name: "Grigori by oryth.io",
        applicationCategory: "BusinessApplication",
        description: seoConfig.description,
        url: `${SITE_ORIGIN}${pathname}`,
        creator: {
          "@type": "Organization",
          name: "oryth.io",
          url: SITE_ORIGIN,
        },
      },
      seoConfig,
    };
  }

  if (pathname === "/reports") return "reports";
  if (pathname === "/intel" || pathname === "/intel-board" || pathname === "/classic") return "classic";
  return "globe";
}

function pathToView(pathname) {
  const route = getRouteConfig(pathname);
  return typeof route === "string" ? route : route.view;
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

function setLink(rel, href) {
  let tag = document.querySelector(`link[rel="${rel}"]`);
  if (!tag) {
    tag = document.createElement("link");
    tag.setAttribute("rel", rel);
    document.head.appendChild(tag);
  }
  tag.setAttribute("href", href);
}

function setStructuredData(data) {
  const id = "grigori-structured-data";
  let script = document.getElementById(id);
  if (!script) {
    script = document.createElement("script");
    script.id = id;
    script.type = "application/ld+json";
    document.head.appendChild(script);
  }
  script.textContent = JSON.stringify(data);
}

function Shell() {
  const [pathname, setPathname] = useState(() => window.location.pathname);
  const [view, setView] = useState(() => pathToView(window.location.pathname));
  const [isCompact, setIsCompact] = useState(() => (typeof window !== "undefined" ? window.innerWidth < 768 : false));
  const activeRoute = typeof getRouteConfig(pathname) === "string"
    ? {
        view: pathToView(pathname),
        path: pathname,
        title: VIEW_CONFIG[pathToView(pathname)]?.title ?? DEFAULT_META.title,
        description: VIEW_CONFIG[pathToView(pathname)]?.description ?? DEFAULT_META.description,
        canonical: `${SITE_ORIGIN}${pathname === "/classic" || pathname === "/intel-board" ? "/intel" : pathname}`,
        type: "website",
        structuredData: {
          "@context": "https://schema.org",
          "@type": "WebApplication",
          name: "Grigori by oryth.io",
          applicationCategory: "BusinessApplication",
          description: DEFAULT_META.description,
          url: `${SITE_ORIGIN}${pathname === "/classic" || pathname === "/intel-board" ? "/intel" : pathname}`,
          creator: {
            "@type": "Organization",
            name: "oryth.io",
            url: SITE_ORIGIN,
          },
        },
        seoConfig: null,
      }
    : getRouteConfig(pathname);

  useEffect(() => {
    const onPopState = () => {
      setPathname(window.location.pathname);
      setView(pathToView(window.location.pathname));
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    const onResize = () => setIsCompact(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    document.title = activeRoute.title;
    setMeta("description", activeRoute.description);
    setMeta("title", activeRoute.title);
    setMeta("robots", "index, follow");
    setPropertyMeta("og:title", activeRoute.title);
    setPropertyMeta("og:description", activeRoute.description);
    setPropertyMeta("og:type", activeRoute.type ?? "website");
    setPropertyMeta("og:url", activeRoute.canonical);
    setPropertyMeta("og:image", DEFAULT_META.image);
    setPropertyMeta("og:site_name", "Grigori by oryth.io");
    setMeta("twitter:card", "summary_large_image");
    setMeta("twitter:title", activeRoute.title);
    setMeta("twitter:description", activeRoute.description);
    setMeta("twitter:image", DEFAULT_META.image);
    setLink("canonical", activeRoute.canonical);
    setStructuredData(activeRoute.structuredData);
  }, [activeRoute]);

  const navigate = (nextView) => {
    const target = VIEW_CONFIG[nextView];
    if (!target) return;
    window.history.pushState({}, "", target.path);
    setPathname(target.path);
    setView(nextView);
  };

  const ActiveView = activeRoute.view === "classic" ? ClassicApp : activeRoute.view === "reports" ? ReportsApp : activeRoute.view === "seo" ? null : GlobeApp;
  const showFooter = !(isCompact && activeRoute.view === "globe");

  return (
    <div style={{ width: "100%", height: "100%", position: "relative", overflowY: activeRoute.view === "globe" ? "hidden" : "auto", overflowX: "hidden" }}>
      {activeRoute.view === "seo" ? (
        <SeoLandingPage routeConfig={activeRoute.seoConfig} onNavigate={navigate} />
      ) : (
        <ActiveView key={view} activeView={view} onNavigate={navigate} />
      )}
      {showFooter ? (
      <div style={{
        position: "fixed",
        right: isCompact ? 12 : 18,
        left: isCompact ? 12 : "auto",
        bottom: isCompact ? "calc(env(safe-area-inset-bottom, 0px) + 8px)" : "calc(env(safe-area-inset-bottom, 0px) + 10px)",
        zIndex: 24,
        color: "rgba(148,163,184,0.38)",
        fontSize: isCompact ? 8 : 8.5,
        letterSpacing: isCompact ? "0.08em" : "0.12em",
        textTransform: "uppercase",
        fontFamily: "'Share Tech Mono', 'IBM Plex Mono', monospace",
        pointerEvents: "none",
        padding: isCompact ? "6px 8px" : "6px 9px",
        borderRadius: 999,
        background: "rgba(3, 9, 22, 0.26)",
        border: "1px solid rgba(86, 146, 180, 0.08)",
        backdropFilter: "blur(8px)",
        textAlign: "center",
        whiteSpace: isCompact ? "normal" : "nowrap",
        maxWidth: isCompact ? "calc(100vw - 24px)" : "min(58vw, 360px)",
        lineHeight: 1.45,
      }}>
        Built by oryth.io · OSINT signals · Not financial advice
      </div>
      ) : null}
    </div>
  );
}

createRoot(document.getElementById("root")).render(<Shell />);

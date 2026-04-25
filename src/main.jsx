import { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import ClassicApp from "../grigori.jsx";
import GlobeApp from "../grigori-globe.jsx";

function Shell() {
  const [view, setView] = useState("globe");

  const ActiveView = useMemo(() => (
    view === "classic" ? ClassicApp : GlobeApp
  ), [view]);

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <div
        style={{
          position: "absolute",
          top: 14,
          left: 14,
          zIndex: 3000,
          display: "flex",
          gap: 8,
          padding: 6,
          background: "rgba(2, 8, 20, 0.78)",
          border: "1px solid rgba(56, 189, 248, 0.28)",
          borderRadius: 10,
          backdropFilter: "blur(12px)",
        }}
      >
        {[
          ["globe", "Globe UI"],
          ["classic", "Classic UI"],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setView(key)}
            style={{
              border: "1px solid rgba(56, 189, 248, 0.28)",
              borderRadius: 8,
              padding: "8px 12px",
              background: view === key ? "rgba(14, 165, 233, 0.24)" : "rgba(15, 23, 42, 0.82)",
              color: "#e2e8f0",
              cursor: "pointer",
              fontFamily: "monospace",
              fontSize: 12,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <ActiveView />
    </div>
  );
}

createRoot(document.getElementById("root")).render(<Shell />);

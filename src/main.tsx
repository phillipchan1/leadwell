import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, MemoryRouter } from "react-router-dom";
import App from "./App";
import "./index.css";
import { useStore } from "./store/useStore";
import { DEMO } from "./lib/demo";

// Console access for debugging / resetToSeed (see README).
if (import.meta.env.DEV) {
  (window as unknown as { useStore: typeof useStore }).useStore = useStore;
}

// Dev is served by Vite's own module graph, so the worker would only get in
// HMR's way. Register in production only.
if (import.meta.env.PROD && !DEMO && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // A blocked or unsupported worker just means no offline shell.
    });
  });
}

// The demo can be hosted anywhere, including a sandboxed frame that won't let
// it rewrite the address bar, so its routes live in memory. `#/meeting/…`
// deep-links into it.
const app = DEMO ? (
  <MemoryRouter initialEntries={[window.location.hash.slice(1) || "/today"]}>
    <App />
  </MemoryRouter>
) : (
  <BrowserRouter>
    <App />
  </BrowserRouter>
);

if (DEMO) void useStore.getState().bootstrap();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>{app}</React.StrictMode>
);

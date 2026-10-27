import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import { DEMO } from "./lib/demo";

// Dev is served by Vite's own module graph, so the worker would only get in
// HMR's way. Register in production only.
if (import.meta.env.PROD && !DEMO && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // A blocked or unsupported worker just means no offline shell.
    });
  });
}

const root = ReactDOM.createRoot(document.getElementById("root")!);

/*
 * A shared meeting's link (`/with/<token>`) is a page of its own. It loads
 * neither the store nor the sign-in machinery: whoever opens it has no
 * workspace here, and the token is their whole credential.
 */
const shared = DEMO ? null : window.location.pathname.match(/^\/with\/([A-Za-z0-9_-]+)\/?$/);

if (shared) {
  void import("./guest/GuestPage").then(({ GuestPage }) => {
    root.render(
      <React.StrictMode>
        <GuestPage token={shared[1]} />
      </React.StrictMode>
    );
  });
} else {
  void Promise.all([
    import("react-router-dom"),
    import("./App"),
    import("./store/useStore"),
  ]).then(([{ BrowserRouter, MemoryRouter }, { default: App }, { useStore }]) => {
    // Console access for debugging / resetToSeed (see README).
    if (import.meta.env.DEV) {
      (window as unknown as { useStore: typeof useStore }).useStore = useStore;
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

    root.render(<React.StrictMode>{app}</React.StrictMode>);
  });
}

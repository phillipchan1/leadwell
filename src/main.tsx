import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";
import { useStore } from "./store/useStore";

// Console access for debugging / resetToSeed (see README).
if (import.meta.env.DEV) {
  (window as unknown as { useStore: typeof useStore }).useStore = useStore;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);

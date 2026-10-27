import fs from "node:fs";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/** Serve the static marketing page at /landing in Vite (dev + preview). */
function serveLandingPlugin(): Plugin {
  const landingUrl = (url: string | undefined) => {
    const pathOnly = (url || "").split("?")[0];
    return pathOnly === "/landing" || pathOnly === "/landing/" || pathOnly === "/landing/index.html";
  };
  const serveLanding = (
    req: { url?: string },
    res: { setHeader: (k: string, v: string) => void; end: (s: string) => void },
    next: () => void,
  ) => {
    if (!landingUrl(req.url)) {
      next();
      return;
    }
    const file = path.resolve(__dirname, "public/landing/index.html");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(fs.readFileSync(file, "utf8"));
  };

  return {
    name: "polarch-serve-landing",
    configureServer(server) {
      server.middlewares.use(serveLanding);
    },
    configurePreviewServer(server) {
      server.middlewares.use(serveLanding);
    },
  };
}

/** Pull Vite's app module/CSS out of index.html and inject them only from the
 *  inline boot script, so signed-out `/` can leave for `/landing/` without
 *  downloading the app bundle. */
function deferAppBundle(): Plugin {
  return {
    name: "polarch-defer-app-bundle",
    transformIndexHtml: {
      order: "post",
      handler(html) {
        type Asset = { k: "css" | "preload" | "js"; h: string; c?: number };
        const assets: Asset[] = [];

        const take = (tag: string, kind: Asset["k"]) => {
          const href = tag.match(/\s(?:href|src)=["']([^"']+)["']/i)?.[1];
          if (!href) return tag;
          const item: Asset = { k: kind, h: href };
          if (/\scrossorigin\b/i.test(tag)) item.c = 1;
          assets.push(item);
          return "";
        };

        html = html.replace(
          /<link\b[^>]*\brel=["']modulepreload["'][^>]*>/gi,
          (tag) => take(tag, "preload"),
        );
        html = html.replace(
          /<link\b[^>]*\brel=["']stylesheet["'][^>]*>/gi,
          (tag) => take(tag, "css"),
        );
        html = html.replace(
          /<script\b[^>]*\btype=["']module["'][^>]*><\/script>/gi,
          (tag) => take(tag, "js"),
        );

        if (!assets.some((a) => a.k === "js")) {
          throw new Error("polarch-defer-app-bundle: no app module found in index.html");
        }
        if (!html.includes("// POLARCH_LOAD_APP")) {
          throw new Error("polarch-defer-app-bundle: missing POLARCH_LOAD_APP marker");
        }

        const body =
          "if(window.__POLARCH_APP)return;window.__POLARCH_APP=1;var A=" +
          JSON.stringify(assets) +
          ";for(var i=0;i<A.length;i++){var x=A[i],n;if(x.k===\"css\"){n=document.createElement(\"link\");n.rel=\"stylesheet\";n.href=x.h;if(x.c)n.crossOrigin=\"\";document.head.appendChild(n);}else if(x.k===\"preload\"){n=document.createElement(\"link\");n.rel=\"modulepreload\";n.href=x.h;document.head.appendChild(n);}else{n=document.createElement(\"script\");n.type=\"module\";n.src=x.h;if(x.c)n.crossOrigin=\"\";document.head.appendChild(n);}}";

        return html.replace("// POLARCH_LOAD_APP", body);
      },
    },
  };
}

export default defineConfig(() => {
  const workerOrigin = process.env.POLARCH_WORKER_ORIGIN || "http://127.0.0.1:8787";

  return {
    // The demo build is served from wherever it's hosted, not a site root.
    base: process.env.VITE_DEMO === "1" ? "./" : "/",
    plugins: [
      react(),
      tailwindcss(),
      serveLandingPlugin(),
      {
        name: "polarch-demo-html",
        transformIndexHtml(html) {
          if (process.env.VITE_DEMO === "1") {
            return html.replace("var POLARCH_DEMO = false;", "var POLARCH_DEMO = true;");
          }
          return html;
        },
      },
      deferAppBundle(),
    ],
    resolve: {
      alias: { "@": path.resolve(__dirname, "src") },
    },
    server: {
      port: Number(process.env.PORT) || 5173,
      proxy: {
        "/api": { target: workerOrigin, changeOrigin: true },
        "/functions": { target: workerOrigin, changeOrigin: true },
      },
    },
  };
});

import fs from "node:fs";
import path from "node:path";
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const SUPABASE_REF_MARKER = 'var SUPABASE_REF = "";';

function supabaseRefFromUrl(url: string): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.split(".")[0] || "";
  } catch {
    return "";
  }
}

function injectSupabaseRef(html: string, ref: string): string {
  const assignment = "var SUPABASE_REF = " + JSON.stringify(ref) + ";";
  if (html.includes(SUPABASE_REF_MARKER)) {
    return html.replace(SUPABASE_REF_MARKER, assignment);
  }
  if (html.includes(assignment) || /var SUPABASE_REF = "[\w-]*";/.test(html)) {
    return html;
  }
  throw new Error("leadwell-inject-supabase-ref: missing SUPABASE_REF marker");
}

/** Stamp `sb-<ref>-auth-token` into the root and landing boot scripts from
 *  VITE_SUPABASE_URL. The ref is public (it's the project hostname) — never
 *  bake the anon key into HTML. */
function injectSupabaseRefPlugin(ref: string): Plugin {
  const landingUrl = (url: string | undefined) => {
    const pathOnly = (url || "").split("?")[0];
    return pathOnly === "/landing" || pathOnly === "/landing/" || pathOnly === "/landing/index.html";
  };
  const serveLanding = (req: { url?: string }, res: { setHeader: (k: string, v: string) => void; end: (s: string) => void }, next: () => void) => {
    if (!landingUrl(req.url)) {
      next();
      return;
    }
    const file = path.resolve(__dirname, "public/landing/index.html");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(injectSupabaseRef(fs.readFileSync(file, "utf8"), ref));
  };

  return {
    name: "leadwell-inject-supabase-ref",
    transformIndexHtml: {
      order: "pre",
      handler(html) {
        return injectSupabaseRef(html, ref);
      },
    },
    configureServer(server) {
      server.middlewares.use(serveLanding);
    },
    configurePreviewServer(server) {
      server.middlewares.use(serveLanding);
    },
    writeBundle() {
      const file = path.resolve(__dirname, "dist/landing/index.html");
      if (!fs.existsSync(file)) {
        throw new Error("leadwell-inject-supabase-ref: dist/landing/index.html missing");
      }
      fs.writeFileSync(file, injectSupabaseRef(fs.readFileSync(file, "utf8"), ref));
    },
  };
}

/** Pull Vite's app module/CSS out of index.html and inject them only from the
 *  inline boot script, so signed-out `/` can leave for `/landing/` without
 *  downloading the app bundle. */
function deferAppBundle(): Plugin {
  return {
    name: "leadwell-defer-app-bundle",
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
          (tag) => take(tag, "preload")
        );
        html = html.replace(
          /<link\b[^>]*\brel=["']stylesheet["'][^>]*>/gi,
          (tag) => take(tag, "css")
        );
        html = html.replace(
          /<script\b[^>]*\btype=["']module["'][^>]*><\/script>/gi,
          (tag) => take(tag, "js")
        );

        if (!assets.some((a) => a.k === "js")) {
          throw new Error("leadwell-defer-app-bundle: no app module found in index.html");
        }
        if (!html.includes("// LEADWELL_LOAD_APP")) {
          throw new Error("leadwell-defer-app-bundle: missing LEADWELL_LOAD_APP marker");
        }

        const body =
          "if(window.__LW_APP)return;window.__LW_APP=1;var A=" +
          JSON.stringify(assets) +
          ";for(var i=0;i<A.length;i++){var x=A[i],n;if(x.k===\"css\"){n=document.createElement(\"link\");n.rel=\"stylesheet\";n.href=x.h;if(x.c)n.crossOrigin=\"\";document.head.appendChild(n);}else if(x.k===\"preload\"){n=document.createElement(\"link\");n.rel=\"modulepreload\";n.href=x.h;document.head.appendChild(n);}else{n=document.createElement(\"script\");n.type=\"module\";n.src=x.h;if(x.c)n.crossOrigin=\"\";document.head.appendChild(n);}}";

        return html.replace("// LEADWELL_LOAD_APP", body);
      },
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const supabaseUrl = process.env.VITE_SUPABASE_URL || env.VITE_SUPABASE_URL || "";
  const supabaseRef = supabaseRefFromUrl(supabaseUrl);

  return {
    // The demo build is served from wherever it's hosted, not a site root.
    base: process.env.VITE_DEMO === "1" ? "./" : "/",
    plugins: [
      react(),
      tailwindcss(),
      injectSupabaseRefPlugin(supabaseRef),
      {
        name: "leadwell-demo-html",
        transformIndexHtml(html) {
          if (process.env.VITE_DEMO === "1") {
            return html.replace("var LEADWELL_DEMO = false;", "var LEADWELL_DEMO = true;");
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
    },
  };
});

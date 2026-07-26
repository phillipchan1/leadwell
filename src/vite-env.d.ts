/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** Dev-only test account for driving the signed-in app. See SETUP.md. */
  readonly VITE_DEV_TEST_EMAIL?: string;
  readonly VITE_DEV_TEST_PASSWORD?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

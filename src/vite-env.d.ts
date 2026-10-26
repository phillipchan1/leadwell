/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEMO?: string;
  /** Dev-only test account for driving the signed-in app. See RUNBOOK.md. */
  readonly VITE_DEV_TEST_EMAIL?: string;
  readonly VITE_DEV_TEST_PASSWORD?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

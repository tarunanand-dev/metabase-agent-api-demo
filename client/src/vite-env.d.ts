/// <reference types="vite/client" />

import type { DetailedHTMLProps, HTMLAttributes } from "react";

interface ImportMetaEnv {
  /** Set from `METABASE_INSTANCE_URL` in repo-root `.env` via `vite.config.ts` `define`. */
  readonly VITE_METABASE_INSTANCE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare global {
  interface Window {
    metabaseConfig?: {
      instanceUrl?: string;
      preferredAuthMethod?: string;
      fetchRequestToken?: () => Promise<{ jwt: string }>;
    };
  }
}

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "metabase-browser": DetailedHTMLProps<
        HTMLAttributes<HTMLElement> & {
          "initial-collection"?: string;
          "read-only"?: string;
        },
        HTMLElement
      >;
    }
  }
}

export {};

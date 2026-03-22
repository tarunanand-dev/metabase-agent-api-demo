/// <reference types="vite/client" />

import type { DetailedHTMLProps, HTMLAttributes } from "react";

declare global {
  interface Window {
    metabaseConfig?: {
      useExistingUserSession?: boolean;
      instanceUrl?: string;
    };
    defineMetabaseConfig?: (config: Window["metabaseConfig"]) => void;
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

/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_PAYPAL_CLIENT_ID?: string;
  readonly VITE_DEMO_SHOPPER_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

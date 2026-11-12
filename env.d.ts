/// <reference types="vite/client" />

interface Window {
  /** Written by the container's entrypoint into /config.js; see public/config.js. */
  __LML_CONFIG__?: { apiBase?: string }
}

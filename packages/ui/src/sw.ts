/// <reference lib="webworker" />

import {
  CacheFirst,
  ExpirationPlugin,
  NetworkFirst,
  Serwist,
  StaleWhileRevalidate,
  type PrecacheEntry,
} from "serwist"

declare const self: ServiceWorkerGlobalScope & {
  __SW_MANIFEST: Array<string | PrecacheEntry>
}

const kratosOrigin = import.meta.env.VITE_KRATOS_PUBLIC_URL
  ? new URL(import.meta.env.VITE_KRATOS_PUBLIC_URL).origin
  : null
const precacheEntries = Array.isArray(self.__SW_MANIFEST) ? self.__SW_MANIFEST : []

function isPrivateRequest(url: URL): boolean {
  return url.pathname.startsWith("/api/") || (kratosOrigin !== null && url.origin === kratosOrigin)
}

const serwist = new Serwist({
  precacheEntries,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      matcher: ({ request, url }) =>
        request.mode === "navigate" && !isPrivateRequest(url),
      handler: new NetworkFirst({
        cacheName: "app-shell",
        networkTimeoutSeconds: 3,
      }),
    },
    {
      matcher: ({ request, url }) =>
        !isPrivateRequest(url) &&
        ["style", "script", "worker"].includes(request.destination),
      handler: new StaleWhileRevalidate({
        cacheName: "static-assets",
      }),
    },
    {
      matcher: ({ request, url }) =>
        !isPrivateRequest(url) &&
        (request.destination === "image" || url.pathname.endsWith(".webmanifest")),
      handler: new CacheFirst({
        cacheName: "static-images",
        plugins: [
          new ExpirationPlugin({
            maxEntries: 64,
            maxAgeSeconds: 7 * 24 * 60 * 60,
          }),
        ],
      }),
    },
    {
      matcher: ({ url }) => url.origin === "https://fonts.googleapis.com" || url.origin === "https://fonts.gstatic.com",
      handler: new StaleWhileRevalidate({
        cacheName: "font-assets",
        plugins: [
          new ExpirationPlugin({
            maxEntries: 16,
            maxAgeSeconds: 30 * 24 * 60 * 60,
          }),
        ],
      }),
    },
  ],
})

serwist.addEventListeners()

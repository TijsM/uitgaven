// Minimal service worker: makes the app installable. Everything still goes to the network,
// since the app needs Notion and Claude to be useful anyway.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});

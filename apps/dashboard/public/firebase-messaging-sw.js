/* global importScripts, firebase */
importScripts("https://www.gstatic.com/firebasejs/11.10.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/11.10.0/firebase-messaging-compat.js");

async function initFirebaseMessagingInSw() {
  if (self.__FIREBASE_MESSAGING_READY__) return;
  const res = await fetch("/firebase-config", { cache: "no-store" });
  if (!res.ok) return;
  const cfg = await res.json();
  if (!cfg?.projectId) return;
  if (!firebase.apps.length) firebase.initializeApp(cfg);
  const messaging = firebase.messaging();
  messaging.onBackgroundMessage((payload) => {
    const title = payload.notification?.title || "Meet Bot";
    const body = payload.notification?.body || "Yeni bildiriş";
    self.registration.showNotification(title, { body });
  });
  self.__FIREBASE_MESSAGING_READY__ = true;
}

self.addEventListener("activate", (event) => {
  event.waitUntil(initFirebaseMessagingInSw());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "INIT_FIREBASE_MESSAGING") {
    event.waitUntil(initFirebaseMessagingInSw());
  }
});

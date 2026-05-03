import { initializeApp, getApps, type FirebaseOptions } from "firebase/app";
import { getMessaging, getToken, isSupported } from "firebase/messaging";

const fallbackFirebaseConfig: FirebaseOptions = {
  apiKey: "AIzaSyC6NLMhmC16SQt6qvkJhG9G_wY-NjFYc-s",
  authDomain: "meet-bot-b1488.firebaseapp.com",
  projectId: "meet-bot-b1488",
  storageBucket: "meet-bot-b1488.firebasestorage.app",
  messagingSenderId: "396775271753",
  appId: "1:396775271753:web:e69362659e84882f70be98",
};

type RuntimeFirebaseConfig = FirebaseOptions & { vapidKey?: string };

async function getRuntimeFirebaseConfig(): Promise<RuntimeFirebaseConfig> {
  try {
    const res = await fetch("/firebase-config", { cache: "no-store" });
    if (!res.ok) return fallbackFirebaseConfig;
    const cfg = (await res.json()) as RuntimeFirebaseConfig;
    return {
      ...fallbackFirebaseConfig,
      ...cfg,
    };
  } catch {
    return fallbackFirebaseConfig;
  }
}

export async function getBrowserPushToken(): Promise<string | null> {
  if (!(await isSupported())) return null;
  const firebaseConfig = await getRuntimeFirebaseConfig();
  if (!firebaseConfig.projectId) throw new Error("Firebase konfiqurasiyasında projectId tapılmadı.");
  if (!getApps().length) initializeApp(firebaseConfig);
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return null;
  const messaging = getMessaging();
  const serviceWorkerRegistration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
  serviceWorkerRegistration.active?.postMessage({ type: "INIT_FIREBASE_MESSAGING" });
  const vapidKey =
    firebaseConfig.vapidKey || process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY || process.env.NEXT_PUBLIC_VAPID_KEY;
  try {
    if (vapidKey) {
      return await getToken(messaging, {
        vapidKey,
        serviceWorkerRegistration,
      });
    }
    return await getToken(messaging, { serviceWorkerRegistration });
  } catch (err) {
    if (!vapidKey) {
      throw new Error(
        "Firebase VAPID açarı tapılmadı. Firebase Console > Project Settings > Cloud Messaging > Web Push certificates bölməsindən açarı yaradıb NEXT_PUBLIC_FIREBASE_VAPID_KEY kimi əlavə edin."
      );
    }
    throw err instanceof Error ? err : new Error(String(err));
  }
}

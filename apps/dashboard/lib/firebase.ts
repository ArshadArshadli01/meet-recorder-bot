import { initializeApp, getApps, type FirebaseOptions } from "firebase/app";
import { getMessaging, getToken, isSupported } from "firebase/messaging";

const fallbackFirebaseConfig: FirebaseOptions = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
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

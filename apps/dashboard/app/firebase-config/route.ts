import { NextResponse } from "next/server";

export async function GET() {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY || "";
  const authDomain =
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || process.env.FIREBASE_AUTH_DOMAIN || "";
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || "";
  const messagingSenderId =
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || process.env.FIREBASE_MESSAGING_SENDER_ID || "";
  const appId =
    process.env.NEXT_PUBLIC_FIREBASE_APP_ID || process.env.FIREBASE_APP_ID || "";
  const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY || process.env.FIREBASE_VAPID_KEY || process.env.VAPID_KEY || "";

  return NextResponse.json({
    apiKey,
    authDomain,
    projectId,
    messagingSenderId,
    appId,
    vapidKey,
  });
}

# Google Cloud OAuth for meet-bot

Dashboard login requires a **Web application** OAuth 2.0 client. These steps match what [.env.example](../.env.example) expects for `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `PUBLIC_BASE_URL`.

## 1. Create or select a project

Open [Google Cloud Console](https://console.cloud.google.com/) and select a project (or create one).

## 2. Enable the People API (and consent screen)

1. **APIs & Services** → **Library** → enable **Google People API** (used for profile/email as configured by the app).
2. **APIs & Services** → **OAuth consent screen**: choose **External** (unless you use Workspace-only internal), fill app name, support email, and scopes if prompted. Add test users while in “Testing” if you keep the app unpublished.

## 3. Create OAuth client credentials

1. **APIs & Services** → **Credentials** → **Create credentials** → **OAuth client ID**.
2. Application type: **Web application**.
3. **Authorized JavaScript origins** — add the origins users hit in the browser, for example:
   - `http://localhost:4000` (local dashboard)
   - `https://dashboard.yourdomain.com` (production dashboard)
4. **Authorized redirect URIs** — must match how the API builds redirect URLs. Typically the **API** origin + OAuth path, for example:
   - `http://localhost:3000/auth/google/callback` (if API is on port 3000 locally)
   - `https://api.yourdomain.com/auth/google/callback` (production)

`PUBLIC_BASE_URL` in `.env` must be exactly the scheme + host + port of the API as used in those redirect URIs (no trailing slash mismatch).

## 4. Copy credentials into `.env`

```env
GOOGLE_CLIENT_ID=....apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
PUBLIC_BASE_URL=http://localhost:3000
```

Also set `SESSION_SECRET`, `TOKEN_ENC_KEY`, and `DATA_ENC_KEY` — see [DEPLOYMENT.md](DEPLOYMENT.md#minimum-secrets-for-a-working-stack).

## 5. Publishing the app

While the OAuth consent screen is in **Testing**, only listed test users can sign in. To allow any Google account, submit the app for verification when you increase scopes or switch to **In production** (Google’s requirements depend on scopes and sensitivity).

## Troubleshooting

- **Redirect URI mismatch**: The URI in the error must appear **character-for-character** in Authorized redirect URIs; check `http` vs `https`, port, and path.
- **Cookies / login loops**: Ensure `PUBLIC_BASE_URL` matches the URL users use to reach the API and that `DASHBOARD_ORIGIN` matches the dashboard URL for CORS.

More context: [DEPLOYMENT.md](DEPLOYMENT.md).

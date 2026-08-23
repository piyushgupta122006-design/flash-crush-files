// useAuth.js
// Universal Google OAuth2 & Google Drive Integration
// Works in Microsoft Edge, Brave, Google Chrome, Safari, Firefox, and Mobile browsers.

import { useState, useRef, useCallback, useEffect } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithCredential,
  signOut as fbSignOut,
  onAuthStateChanged,
} from "firebase/auth";

const firebaseConfig = {
  apiKey:            "AIzaSyC5UBvHZyZs7n9ZRS74cMU92UZOuAGLfow",
  authDomain:        "flash-crush.firebaseapp.com",
  projectId:         "flash-crush",
  storageBucket:     "flash-crush.firebasestorage.app",
  messagingSenderId: "564511509147",
  appId:             "1:564511509147:web:8d36c5b734792f0779943e",
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(app);

export const GOOGLE_CLIENT_ID = "564511509147-o97737rbfs6f0c2qsq9lqdmpknktfjg1.apps.googleusercontent.com";
export const GOOGLE_API_KEY = "AIzaSyC5UBvHZyZs7n9ZRS74cMU92UZOuAGLfow";

const DRIVE_SCOPES = [
  "email",
  "profile",
  "openid",
  "https://www.googleapis.com/auth/drive.file",
].join(" ");

// ── Persistent Storage Helpers ───────────────────────────────────────────────
const AUTH_STORAGE_KEY = "fc_auth_state";

function saveAuthState(state) {
  try {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(state));
  } catch { /* storage fallback */ }
}

function loadAuthState() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.token && parsed.token.expiresAt > Date.now() + 30_000) {
      return parsed;
    }
  } catch { /* ignore */ }
  return null;
}

function clearAuthState() {
  try {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    sessionStorage.removeItem("fc_drive_token");
  } catch { /* ignore */ }
}

// ── Script Loaders with Retry ───────────────────────────────────────────────
function loadScriptWithRetry(id, src, retries = 3) {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const attempt = (n) => {
      if (window.google?.accounts?.oauth2) {
        resolve();
        return;
      }
      const existing = document.getElementById(id);
      if (existing) existing.remove();

      const s = document.createElement("script");
      s.id = id;
      s.src = src;
      s.async = true;
      s.onload = () => {
        resolve();
      };
      s.onerror = (err) => {
        if (n > 1) {
          setTimeout(() => attempt(n - 1), 600);
        } else {
          reject(new Error("Could not connect to Google services. If you use Brave or an AdBlocker, please disable Shields or allow Google on this site."));
        }
      };
      document.head.appendChild(s);
    };
    attempt(retries);
  });
}

function loadGapiPicker() {
  if (window.google?.picker) return Promise.resolve();
  return new Promise((resolve) => {
    if (window.gapi?.load) {
      try {
        window.gapi.load("picker", resolve);
      } catch {
        resolve();
      }
      return;
    }
    const existing = document.getElementById("gapi-script");
    if (existing) {
      existing.addEventListener("load", () => {
        try {
          window.gapi?.load?.("picker", resolve);
        } catch {
          resolve();
        }
      });
      return;
    }
    const s = document.createElement("script");
    s.id = "gapi-script";
    s.src = "https://apis.google.com/js/api.js";
    s.async = true;
    s.onload = () => {
      try {
        window.gapi?.load?.("picker", resolve);
      } catch {
        resolve();
      }
    };
    s.onerror = () => resolve();
    document.head.appendChild(s);
  });
}

export function useAuth() {
  const initialData = useRef(loadAuthState());
  const [user, setUser] = useState(initialData.current?.user || null);
  const [authStatus, setAuthStatus] = useState(initialData.current ? "signedin" : "idle");
  const [authError, setAuthError] = useState(null);

  const driveTokenRef = useRef(initialData.current?.token || { accessToken: null, expiresAt: 0 });
  const gisReadyRef = useRef(false);
  const gapiPickerReadyRef = useRef(false);

  // Restore or sync Firebase Auth state
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (fbUser) => {
      if (fbUser && !user) {
        setUser({
          name: fbUser.displayName,
          email: fbUser.email,
          picture: fbUser.photoURL,
          uid: fbUser.uid,
        });
        setAuthStatus("signedin");
      }
    });
    return unsub;
  }, [user]);

  const ensureGisReady = useCallback(async () => {
    if (window.google?.accounts?.oauth2) {
      gisReadyRef.current = true;
      return;
    }
    await loadScriptWithRetry("gis-script", "https://accounts.google.com/gsi/client");
    gisReadyRef.current = true;
  }, []);

  const ensurePickerReady = useCallback(async () => {
    if (gapiPickerReadyRef.current && window.google?.picker) return;
    await loadGapiPicker();
    gapiPickerReadyRef.current = true;
  }, []);

  // ── Universal Google Sign-In via Google Identity Services Token Client ──────
  const signIn = useCallback(async () => {
    setAuthStatus("loading");
    setAuthError(null);

    try {
      await ensureGisReady();

      return new Promise((resolve) => {
        try {
          const client = window.google.accounts.oauth2.initTokenClient({
            client_id: GOOGLE_CLIENT_ID,
            scope: DRIVE_SCOPES,
            callback: async (resp) => {
              if (resp.error || !resp.access_token) {
                setAuthError(resp.error_description || resp.error || "Sign-in failed.");
                setAuthStatus("idle");
                resolve(false);
                return;
              }

              const expiresInMs = (resp.expires_in || 3600) * 1000;
              const tokenData = {
                accessToken: resp.access_token,
                expiresAt: Date.now() + expiresInMs,
              };
              driveTokenRef.current = tokenData;

              // Fetch User Details from Google UserInfo endpoint
              try {
                const infoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
                  headers: { Authorization: `Bearer ${resp.access_token}` },
                });
                if (infoRes.ok) {
                  const info = await infoRes.json();
                  const userData = {
                    name: info.name || info.given_name || "User",
                    email: info.email,
                    picture: info.picture,
                    uid: info.sub,
                  };
                  setUser(userData);
                  saveAuthState({ user: userData, token: tokenData });
                  console.log("[FlashCrush] Signed in successfully as:", userData.email);

                  // Optional background Firebase sync
                  try {
                    const cred = GoogleAuthProvider.credential(null, resp.access_token);
                    signInWithCredential(auth, cred).catch(() => {});
                  } catch { /* optional */ }
                }
              } catch (err) {
                console.warn("[FlashCrush] Userinfo fetch warning:", err);
              }

              setAuthStatus("signedin");
              resolve(true);
            },
            error_callback: (err) => {
              setAuthError("Sign-in pop-up was blocked. Please allow popups in your browser address bar.");
              setAuthStatus("idle");
              resolve(false);
            },
          });

          // Request access token seamlessly without forcing repeated consent screen
          client.requestAccessToken({ prompt: "" });
        } catch (initErr) {
          setAuthError(initErr.message || "Failed to initialize Google login.");
          setAuthStatus("idle");
          resolve(false);
        }
      });
    } catch (err) {
      setAuthError(err.message || "Sign-in failed.");
      setAuthStatus("idle");
      return false;
    }
  }, [ensureGisReady]);

  // ── Sign Out ────────────────────────────────────────────────────────────────
  const signOut = useCallback(async () => {
    driveTokenRef.current = { accessToken: null, expiresAt: 0 };
    clearAuthState();
    setUser(null);
    setAuthStatus("idle");
    try {
      await fbSignOut(auth);
    } catch { /* ignore */ }
  }, []);

  const clearDriveToken = useCallback(() => {
    driveTokenRef.current = { accessToken: null, expiresAt: 0 };
    clearAuthState();
  }, []);

  // ── Get Active Token (or acquire on-demand) ──────────────────────────────────
  const getToken = useCallback(async () => {
    const now = Date.now();
    const tokenInfo = driveTokenRef.current;

    // 1. Return cached token if valid
    if (tokenInfo.accessToken && tokenInfo.expiresAt - 30_000 > now) {
      return tokenInfo.accessToken;
    }

    // 2. Token expired or missing — trigger sign in
    const ok = await signIn();
    if (ok && driveTokenRef.current.accessToken) {
      return driveTokenRef.current.accessToken;
    }
    throw new Error("Please sign in with Google to access Google Drive.");
  }, [signIn]);

  // ── Authenticated Fetch helper ──────────────────────────────────────────────
  const fetchWithDriveAuth = useCallback(
    async (url, options = {}, retry401 = true) => {
      const token = await getToken();
      const headers = {
        ...(options.headers || {}),
        Authorization: `Bearer ${token}`,
      };

      const response = await fetch(url, { ...options, headers });
      if (response.status === 401 && retry401) {
        clearDriveToken();
        return fetchWithDriveAuth(url, options, false);
      }
      return response;
    },
    [clearDriveToken, getToken]
  );

  // ── Upload any document/file to Google Drive ────────────────────────────────
  const uploadToDrive = useCallback(async (blob, fileName, folderId = null) => {
    const metadata = {
      name: fileName,
      mimeType: blob.type || "application/octet-stream",
      ...(folderId ? { parents: [folderId] } : {}),
    };

    const form = new FormData();
    form.append(
      "metadata",
      new Blob([JSON.stringify(metadata)], { type: "application/json" })
    );
    form.append("file", blob, fileName);

    const res = await fetchWithDriveAuth(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink",
      { method: "POST", body: form }
    );

    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e?.error?.message || "Upload failed");
    }
    return res.json();
  }, [fetchWithDriveAuth]);

  // ── Pick any document/file from Google Drive ────────────────────────────────
  const pickFromDrive = useCallback(async (mimeTypes, onFilePicked, preToken) => {
    const token = preToken || await getToken();
    await ensurePickerReady();

    return new Promise((resolve) => {
      const docsView = new window.google.picker.DocsView();
      if (mimeTypes && mimeTypes.length > 0) {
        docsView.setMimeTypes(mimeTypes.join(","));
      }
      docsView.setIncludeFolders(false);

      const picker = new window.google.picker.PickerBuilder()
        .setOAuthToken(token)
        .setDeveloperKey(GOOGLE_API_KEY)
        .setAppId("564511509147")
        .setOrigin(window.location.origin)
        .setTitle("Select a file from your Google Drive")
        .addView(docsView)
        .setCallback(async (data) => {
          if (data.action === window.google.picker.Action.PICKED) {
            const doc = data.docs[0];
            const dlRes = await fetchWithDriveAuth(
              `https://www.googleapis.com/drive/v3/files/${doc.id}?alt=media`
            );
            if (!dlRes.ok) {
              resolve(null);
              return;
            }
            const blob = await dlRes.blob();
            const file = new File([blob], doc.name, { type: doc.mimeType || blob.type });
            onFilePicked(file);
            resolve(file);
          } else if (data.action === window.google.picker.Action.CANCEL) {
            resolve(null);
          }
        })
        .build();
      picker.setVisible(true);
    });
  }, [ensurePickerReady, fetchWithDriveAuth, getToken]);

  return {
    user,
    authStatus,
    authError,
    signIn,
    signOut,
    getToken,
    clearDriveToken,
    uploadToDrive,
    pickFromDrive,
    ensurePickerReady,
  };
}

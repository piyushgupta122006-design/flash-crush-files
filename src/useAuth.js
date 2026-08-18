// useAuth.js
// Two-step auth flow:
// 1) Firebase sign-in with basic profile/email scopes only.
// 2) Google Identity Services token for Drive scopes, only when needed.

import { useState, useRef, useCallback, useEffect } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
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

const DRIVE_SCOPE = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/drive.readonly",
].join(" ");

function loadScript(id, src) {
  return new Promise((resolve, reject) => {
    if (document.getElementById(id)) {
      resolve();
      return;
    }
    const s = document.createElement("script");
    s.id = id;
    s.src = src;
    s.async = true;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

function loadGapiPicker() {
  return new Promise((resolve) => {
    loadScript("gapi-script", "https://apis.google.com/js/api.js").then(() => {
      window.gapi.load("picker", resolve);
    });
  });
}

// ── sessionStorage helpers for Drive token persistence ────────────────────────
const DRIVE_TOKEN_KEY = "fc_drive_token";

function saveDriveToken(tokenData) {
  try {
    sessionStorage.setItem(DRIVE_TOKEN_KEY, JSON.stringify(tokenData));
  } catch { /* quota or private mode */ }
}

function loadDriveToken() {
  try {
    const raw = sessionStorage.getItem(DRIVE_TOKEN_KEY);
    if (!raw) return { accessToken: null, expiresAt: 0 };
    const parsed = JSON.parse(raw);
    // Only return if not expired
    if (parsed.accessToken && parsed.expiresAt > Date.now() + 30_000) {
      return parsed;
    }
    sessionStorage.removeItem(DRIVE_TOKEN_KEY);
  } catch { /* ignore */ }
  return { accessToken: null, expiresAt: 0 };
}

function clearDriveTokenStorage() {
  try { sessionStorage.removeItem(DRIVE_TOKEN_KEY); } catch { /* ignore */ }
}

export function useAuth() {
  const [user, setUser] = useState(null);
  const [authStatus, setAuthStatus] = useState("idle");
  const [authError, setAuthError] = useState(null);

  // Initialize from sessionStorage so token survives page refresh
  const driveTokenRef = useRef(loadDriveToken());
  const gisClientRef = useRef(null);
  const gisReadyRef = useRef(false);
  const gapiPickerReadyRef = useRef(false);

  useEffect(() => {
    // Preload GIS & GAPI scripts immediately on mount
    loadScript("gis-script", "https://accounts.google.com/gsi/client")
      .then(() => { gisReadyRef.current = true; })
      .catch(() => {});
    loadGapiPicker()
      .then(() => { gapiPickerReadyRef.current = true; })
      .catch(() => {});

    const unsub = onAuthStateChanged(auth, (fbUser) => {
      if (fbUser) {
        setUser({
          name:    fbUser.displayName,
          email:   fbUser.email,
          picture: fbUser.photoURL,
          uid:     fbUser.uid,
        });
        setAuthStatus("signedin");
      } else {
        setUser(null);
        driveTokenRef.current = { accessToken: null, expiresAt: 0 };
        clearDriveTokenStorage();
        gisClientRef.current = null;
        setAuthStatus("idle");
      }
    });
    return unsub;
  }, []);

  const ensureGisReady = useCallback(async () => {
    if (gisReadyRef.current && window.google?.accounts?.oauth2) return;
    await loadScript("gis-script", "https://accounts.google.com/gsi/client");
    gisReadyRef.current = true;
  }, []);

  const signIn = useCallback(async () => {
    setAuthStatus("loading");
    setAuthError(null);

    // Primary: Firebase Popup WITH Drive scopes included
    try {
      const provider = new GoogleAuthProvider();
      provider.addScope("https://www.googleapis.com/auth/drive.file");
      provider.addScope("https://www.googleapis.com/auth/drive.readonly");
      provider.setCustomParameters({ prompt: "select_account" });
      const result = await signInWithPopup(auth, provider);
      if (result?.user) {
        // Extract the OAuth access token from the sign-in result
        const credential = GoogleAuthProvider.credentialFromResult(result);
        console.log("[FlashCrush] Sign-in credential:", credential ? "found" : "null");
        console.log("[FlashCrush] Access token:", credential?.accessToken ? "yes (" + credential.accessToken.substring(0, 10) + "...)" : "NO");
        if (credential?.accessToken) {
          const tokenData = {
            accessToken: credential.accessToken,
            expiresAt: Date.now() + 3500 * 1000, // ~58 minutes
          };
          driveTokenRef.current = tokenData;
          saveDriveToken(tokenData);
          console.log("[FlashCrush] Drive token saved ✓");
        }
        setAuthStatus("signedin");
        return true;
      }
    } catch (err) {
      if (
        err.code === "auth/popup-closed-by-user" ||
        err.code === "auth/cancelled-popup-request"
      ) {
        setAuthStatus("idle");
        return false;
      }

      // Fallback: Google Identity Services prompt (for popup-blocked)
      if (err.code === "auth/popup-blocked" || err.message?.includes("popup")) {
        try {
          await ensureGisReady();
          if (window.google?.accounts?.id) {
            return new Promise((resolve) => {
              window.google.accounts.id.initialize({
                client_id: GOOGLE_CLIENT_ID,
                callback: async (response) => {
                  if (response.credential) {
                    try {
                      const credential = GoogleAuthProvider.credential(response.credential);
                      await signInWithCredential(auth, credential);
                      setAuthStatus("signedin");
                      resolve(true);
                      return;
                    } catch (e) {
                      setAuthError(e.message || "Credential sign-in failed.");
                    }
                  }
                  setAuthStatus("error");
                  resolve(false);
                },
              });
              window.google.accounts.id.prompt((notification) => {
                if (notification.isNotDisplayed()) {
                  setAuthError("Pop-up blocked. Please allow pop-ups for this site in your browser URL bar.");
                  setAuthStatus("error");
                  resolve(false);
                }
              });
            });
          }
        } catch {
          // fallback
        }
      }

      setAuthError(err.message || "Sign-in failed.");
      setAuthStatus("error");
      return false;
    }
  }, [ensureGisReady]);

  const signOut = useCallback(async () => {
    driveTokenRef.current = { accessToken: null, expiresAt: 0 };
    clearDriveTokenStorage();
    gisClientRef.current = null;
    await fbSignOut(auth);
  }, []);

  const ensurePickerReady = useCallback(async () => {
    if (gapiPickerReadyRef.current && window.google?.picker) return;
    await loadGapiPicker();
    gapiPickerReadyRef.current = true;
  }, []);

  const clearDriveToken = useCallback(() => {
    driveTokenRef.current = { accessToken: null, expiresAt: 0 };
    clearDriveTokenStorage();
  }, []);

  const getToken = useCallback(async () => {
    const now = Date.now();
    const tokenInfo = driveTokenRef.current;

    // Return cached token if it's still valid
    if (tokenInfo.accessToken && tokenInfo.expiresAt - 30_000 > now) {
      console.log("[FlashCrush] Using cached Drive token, expires in", 
        Math.round((tokenInfo.expiresAt - now) / 60000), "min");
      return tokenInfo.accessToken;
    }

    // Token expired or missing — re-sign in using Firebase popup (works in Edge!)
    console.log("[FlashCrush] Drive token missing/expired, requesting sign-in...");
    const ok = await signIn();
    if (!ok) {
      throw new Error("Sign-in required to access Google Drive.");
    }

    // After signIn, the token should be stored in driveTokenRef
    if (driveTokenRef.current.accessToken) {
      console.log("[FlashCrush] Got Drive token from sign-in ✓");
      return driveTokenRef.current.accessToken;
    }

    throw new Error("Could not get Drive access. Please try signing out and in again.");
  }, [signIn]);

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

  const uploadToDrive = useCallback(async (blob, fileName, folderId = null) => {
    // Build metadata - add `parents` array only when a folder was chosen.
    const metadata = {
      name: fileName,
      mimeType: blob.type,
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

  const pickFromDrive = useCallback(async (mimeTypes, onFilePicked, preToken) => {
    const token = preToken || await getToken();
    await ensurePickerReady();

    return new Promise((resolve) => {
      const picker = new window.google.picker.PickerBuilder()
        .setOAuthToken(token)
        .setDeveloperKey(GOOGLE_API_KEY)
        .setAppId("564511509147")
        .setOrigin(window.location.origin)
        .setTitle("Select a file from your Google Drive")
        .addView(
          new window.google.picker.DocsView()
            .setMimeTypes(mimeTypes.join(","))
            .setIncludeFolders(false)
        )
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
  };
}

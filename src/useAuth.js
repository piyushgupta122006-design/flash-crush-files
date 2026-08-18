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

export function useAuth() {
  const [user, setUser] = useState(null);
  const [authStatus, setAuthStatus] = useState("idle");
  const [authError, setAuthError] = useState(null);

  const driveTokenRef = useRef({ accessToken: null, expiresAt: 0 });
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

    // 1. Primary: Direct Firebase Popup
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const result = await signInWithPopup(auth, provider);
      if (result?.user) {
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

      // 2. If popup is blocked by browser, try Google Identity Services prompt
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
  }, []);

  const getToken = useCallback(async () => {
    const now = Date.now();
    const tokenInfo = driveTokenRef.current;
    if (tokenInfo.accessToken && tokenInfo.expiresAt - 30_000 > now) {
      return tokenInfo.accessToken;
    }

    await ensureGisReady();

    return new Promise((resolve, reject) => {
      try {
        if (!window.google?.accounts?.oauth2) {
          reject(new Error("Google Identity library not loaded yet."));
          return;
        }

        const client = window.google.accounts.oauth2.initTokenClient({
          client_id: GOOGLE_CLIENT_ID,
          scope: DRIVE_SCOPE,
          hint: auth.currentUser?.email || "",
          callback: (resp) => {
            if (resp.error || !resp.access_token) {
              reject(new Error(resp.error_description || resp.error || "Failed to get Drive permission."));
              return;
            }
            const expiresInMs = (resp.expires_in || 3600) * 1000;
            driveTokenRef.current = {
              accessToken: resp.access_token,
              expiresAt: Date.now() + expiresInMs,
            };
            gisClientRef.current = client;
            resolve(resp.access_token);
          },
        });

        // Request token directly with consent or prompt
        client.requestAccessToken({ prompt: "" });
      } catch (err) {
        reject(err);
      }
    });
  }, [ensureGisReady]);

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

  const pickFromDrive = useCallback(async (mimeTypes, onFilePicked) => {
    const token = await getToken();
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

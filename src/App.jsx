// App.jsx — FlashCrush with React Router for real separate pages
import { Routes, Route, NavLink, useNavigate, useLocation } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import "./styles.css";
import { useAuth } from "./useAuth";
import HomePage, { LogoMark } from "./HomePage";
import PDFCompressor   from "./PDFCompressor";
import ImageCompressor from "./ImageCompressor";
import ImageConverter  from "./ImageConverter";
import ImageToPDF      from "./ImageToPDF";
import PDFMerger       from "./PDFMerger";
import PDFToImage      from "./PDFToImage";
import SplitPDF        from "./SplitPDF";
import PDFOrganizer    from "./PDFOrganizer";
import PDFSecurity     from "./PDFSecurity";

function GoogleIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 18 18">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
      <path fill="#FBBC05" d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z"/>
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z"/>
    </svg>
  );
}

export default function App() {
  const [showMenu, setShowMenu]       = useState(false);
  const [signInError, setSignInError] = useState("");
  const menuRef = useRef(null);
  const auth    = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const isSignedIn = auth.authStatus === "signedin";

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (!menuRef.current?.contains(e.target)) setShowMenu(false);
    };

    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Show sign-in error prominently
  useEffect(() => {
    if (!auth.authError) {
      setSignInError("");
      return;
    }
    setSignInError(auth.authError);
    const t = setTimeout(() => setSignInError(""), 10000);
    return () => clearTimeout(t);
  }, [auth.authError]);

  // Scroll to top on route change
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [location.pathname]);

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>

      {/* ── Floating glass navbar ── */}
      <nav className="navbar anim-fade d0">
        <div className="navbar-left">
          <div className="navbar-logo" onClick={() => navigate("/")}>
            <LogoMark size={28} />
            <span>Flash<span style={{ color: "var(--p500)" }}>Crush</span></span>
          </div>
          <div className="navbar-links">
            <NavLink
              to="/"
              end
              className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
            >
              Home
            </NavLink>
            <NavLink
              to="/pdf"
              className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
            >
              PDF
            </NavLink>
            <NavLink
              to="/merge-pdf"
              className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
            >
              Merge
            </NavLink>
            <NavLink
              to="/image"
              className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
            >
              Compress
            </NavLink>
            <NavLink
              to="/convert"
              className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
            >
              Convert
            </NavLink>
            <NavLink
              to="/img2pdf"
              className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
            >
              Image to PDF
            </NavLink>
            <NavLink
              to="/pdf-to-img"
              className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
            >
              PDF to Image
            </NavLink>
            <NavLink
              to="/split-pdf"
              className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
            >
              Split PDF
            </NavLink>
            <NavLink
              to="/organize-pdf"
              className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
            >
              Organize
            </NavLink>
            <NavLink
              to="/pdf-security"
              className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
            >
              Security
            </NavLink>
          </div>
        </div>

        <div className="navbar-right">
          {isSignedIn ? (
            <div className="nav-user-wrap" ref={menuRef}>
              <div className="nav-user" onClick={() => setShowMenu(m => !m)}>
                {auth.user?.picture
                  ? <img src={auth.user.picture} alt="" className="nav-avatar" />
                  : <div className="nav-avatar">{auth.user?.name?.[0] || "G"}</div>
                }
                <span className="nav-chevron">{showMenu ? "▲" : "▼"}</span>
              </div>
              {showMenu && (
                <div className="nav-dropdown">
                  <div className="nav-dropdown-user">
                    <div className="nav-dropdown-name">{auth.user?.name}</div>
                    <div className="nav-dropdown-email">{auth.user?.email}</div>
                  </div>
                  <button className="nav-dropdown-logout" onClick={() => { auth.signOut(); setShowMenu(false); }}>
                    <span>⏻</span> Logout
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="nav-signin-wrap">
              <button
                className="btn-nav-signin"
                onClick={auth.signIn}
                disabled={auth.authStatus === "loading"}
              >
                <GoogleIcon />
                <span className="signin-text-full">
                  {auth.authStatus === "loading" ? "Signing in…" : "Sign in with Google"}
                </span>
                <span className="signin-text-short">
                  {auth.authStatus === "loading" ? "Signing in…" : "Sign in"}
                </span>
              </button>
              {signInError && <div className="nav-signin-error">{signInError}</div>}
            </div>
          )}
        </div>
      </nav>

      {/* ── Routes ── */}
      <main style={{ flex: 1 }}>
        <Routes>
          <Route path="/"           element={<HomePage auth={auth} />} />
          <Route path="/pdf"        element={<PDFCompressor auth={auth} />} />
          <Route path="/merge-pdf"  element={<PDFMerger auth={auth} />} />
          <Route path="/image"      element={<ImageCompressor auth={auth} />} />
          <Route path="/convert"    element={<ImageConverter auth={auth} />} />
          <Route path="/img2pdf"    element={<ImageToPDF auth={auth} />} />
          <Route path="/pdf-to-img" element={<PDFToImage auth={auth} />} />
          <Route path="/split-pdf"     element={<SplitPDF auth={auth} />} />
          <Route path="/organize-pdf"  element={<PDFOrganizer auth={auth} />} />
          <Route path="/pdf-security"  element={<PDFSecurity auth={auth} />} />
          <Route path="*"              element={<HomePage auth={auth} />} />
        </Routes>
      </main>

      {/* ── Footer ── */}
      <footer className="site-footer">
        <span><strong>FlashCrush</strong> — 100% free, no account required</span>
        <span>
          All files processed locally · Never uploaded without your permission ·{" "}
          <a href="/privacy.html" style={{ color: "var(--p500)", textDecoration: "none" }}>Privacy Policy</a>
        </span>
      </footer>

    </div>
  );
}

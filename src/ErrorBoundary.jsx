// ErrorBoundary.jsx — Material Design 3 Crash Resilience & Error Boundary for FlashCrush
import React, { Component } from "react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Log error details for telemetry and debugging
    console.error("FlashCrush ErrorBoundary captured error:", error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReload = () => {
    window.location.reload();
  };

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  handleGoHome = () => {
    window.location.href = "/";
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const errorMessage = this.state.error?.message || "An unexpected error occurred.";
      const isWasmOrMemory =
        errorMessage.toLowerCase().includes("memory") ||
        errorMessage.toLowerCase().includes("wasm") ||
        errorMessage.toLowerCase().includes("out of bounds") ||
        errorMessage.toLowerCase().includes("sharedarraybuffer") ||
        errorMessage.toLowerCase().includes("allocation failed");

      return (
        <div className="min-h-[55vh] flex items-center justify-center p-4 sm:p-6 font-sans">
          <div
            className="w-full max-w-lg bg-m3-surface-container rounded-3xl shadow-m3-elevation-2 border border-m3-outline-variant/60 p-6 sm:p-8 flex flex-col items-center text-center text-m3-on-surface transition-colors"
            role="alert"
            aria-live="assertive"
          >
            {/* Error Icon Pill */}
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-m3-error-container text-m3-on-error-container flex items-center justify-center mb-4 text-2xl sm:text-3xl shadow-xs">
              ⚠️
            </div>

            {/* Title */}
            <h2 className="text-xl sm:text-2xl font-normal text-m3-on-surface tracking-tight mb-2">
              {isWasmOrMemory ? "Memory Limit or Processing Error" : "Something went wrong"}
            </h2>

            {/* Description */}
            <p className="text-sm text-m3-on-surface-variant max-w-md leading-relaxed mb-4">
              {isWasmOrMemory
                ? "This operation reached device memory limits or WebAssembly crashed during heavy file processing. Your files remain 100% private and safe on your device."
                : "A component or on-device task encountered an error. You can try reloading or returning to the home screen."}
            </p>

            {/* Technical Detail Badge */}
            {errorMessage && (
              <div className="w-full bg-m3-surface-container-high rounded-xl p-3 mb-6 text-left border border-m3-outline-variant/40 overflow-hidden">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-m3-on-surface-variant mb-1">
                  Error Details
                </div>
                <div className="text-xs font-mono text-m3-error break-all line-clamp-3">
                  {errorMessage}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center justify-center gap-3 w-full">
              <button
                type="button"
                onClick={this.handleReload}
                className="flex-1 min-w-[150px] px-6 py-2.5 rounded-full bg-m3-primary text-m3-on-primary font-medium text-sm hover:opacity-95 active:scale-[0.98] transition-all shadow-xs"
              >
                Reload App / Try Again
              </button>
              <button
                type="button"
                onClick={this.handleGoHome}
                className="px-5 py-2.5 rounded-full bg-m3-surface-container-high text-m3-on-surface hover:bg-m3-surface-container-highest font-medium text-sm transition-all border border-m3-outline-variant/40"
              >
                Go to Home
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

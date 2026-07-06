import axios from "axios";

const LOCAL_API_URL = "http://localhost:8000";
const RENDER_API_URL = "https://ai-bi.onrender.com";

/**
 * Base URL for the FastAPI backend.
 * Override with NEXT_PUBLIC_API_URL in .env.local (required at build time on Render).
 */
export function getApiBaseUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (fromEnv) {
    return fromEnv.replace(/\/$/, "");
  }

  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host === "ai-bi-frontend.onrender.com") {
      return RENDER_API_URL;
    }
  }

  return LOCAL_API_URL;
}
export const apiClient = axios.create({
  baseURL: getApiBaseUrl(),
  timeout: 120_000,
});

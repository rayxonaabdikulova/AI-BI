import axios from "axios";

/**
 * Base URL for the FastAPI backend. Override with NEXT_PUBLIC_API_URL in .env.local.
 */
export function getApiBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
  return raw.replace(/\/$/, "");
}

export const apiClient = axios.create({
  baseURL: getApiBaseUrl(),
  timeout: 120_000,
});

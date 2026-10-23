import axios from "axios";
import useZustandStore from "../stores/zustandStore";

const getApiBaseUrl = () => {
  // Check environment variables first (works in both DEV and PROD)
  const envUrl = import.meta.env.VITE_API_URL || import.meta.env.VITE_BACKEND_URL;
  
  if (envUrl) {
    if (import.meta.env.PROD) {
      const apiHost = new URL(envUrl, window.location.origin).hostname;
      if (/^(localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|\[?::1\]?)$/i.test(apiHost)) {
        throw new Error("Production API configuration must use a remote server URL.");
      }
    }
    return envUrl;
  }

  // Fallback for local development if no env URL is set
  if (import.meta.env.DEV) {
    return "";
  }

  return window.location.origin;
};

const baseURL = getApiBaseUrl();

console.log("Axios baseURL:", baseURL);
console.log("Mode:", import.meta.env.MODE);

const api = axios.create({
  baseURL: baseURL,
  headers: {
    "Content-Type": "application/json",
  },
});
// ======================
// REQUEST INTERCEPTOR
// ======================
api.interceptors.request.use(
  (config) => {
    const token =
      useZustandStore.getState().token || localStorage.getItem("token");

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => Promise.reject(error),
);

// ======================
// RESPONSE INTERCEPTOR
// ======================
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Don't auto-logout on 401 errors
    // Just reject the error and let the calling function handle it
    return Promise.reject(error);
  },
);

export default api;

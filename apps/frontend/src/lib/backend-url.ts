/**
 * Get the backend URL - uses environment variable or dynamic URL
 * 
 * Production (via Caddy reverse proxy):
 *   - Frontend: https://app.tradebazen.nl
 *   - Backend:  https://app.tradebazen.nl/api (proxied to localhost:3000)
 * 
 * Development (direct access):
 *   - Frontend: http://localhost:5173
 *   - Backend:  http://localhost:3000
 */
export const getBackendUrl = (): string => {
  // 1. Check environment variable (highest priority)
  if (import.meta.env.VITE_BACKEND_URL) {
    return import.meta.env.VITE_BACKEND_URL;
  }
  
  // 2. Production: if running on a real domain (not localhost), use same origin without port
  //    Assumes Caddy/Nginx reverse proxy handles /api/* routing
  const hostname = window.location.hostname;
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('192.168.');
  
  if (!isLocalhost) {
    // Production: use same origin (https://app.tradebazen.nl)
    // Caddy will proxy /api/* to backend:3000
    return window.location.origin;
  }
  
  // 3. Development: use localhost with explicit port
  const protocol = window.location.protocol;
  return `${protocol}//${hostname}:3000`;
};

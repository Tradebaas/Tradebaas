import { createRoot } from 'react-dom/client'
import { ErrorBoundary } from "react-error-boundary";
import { initSparkPolyfill } from './lib/spark-kv-polyfill'

import App from './App.tsx'
import { ErrorFallback } from './ErrorFallback.tsx'

import "./main.css"
import "./styles/theme.css"
import "./index.css"

import './lib/server-proxy'

// Initialize Spark polyfill before rendering
initSparkPolyfill();

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary FallbackComponent={ErrorFallback}>
    <App />
   </ErrorBoundary>
)

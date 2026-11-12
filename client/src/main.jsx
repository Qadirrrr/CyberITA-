import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';
import { AuthProvider } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import ScrollToTop from './components/layout/ScrollToTop';
import './index.css';

// After a fresh deploy, a browser still holding the previous build can
// fail to fetch a lazy-loaded page chunk (the old file was replaced
// mid-load, so the request resets or 404s) and land on the error
// screen. Vite fires vite:preloadError for exactly that case: reload
// once to pick up the new build. The timestamp guard prevents a
// reload loop if the chunk is genuinely unavailable.
window.addEventListener('vite:preloadError', (event) => {
  const KEY = 'cyberita-preload-reload-at';
  let last = 0;
  try {
    last = Number(sessionStorage.getItem(KEY) || 0);
  } catch {
    last = 0;
  }
  if (Date.now() - last < 15000) return;
  try {
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    // Storage unavailable: reload anyway, this fires once per failure.
  }
  event.preventDefault();
  window.location.reload();
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <ToastProvider>
          <AuthProvider>
            <NotificationProvider>
              <ScrollToTop />
              <ErrorBoundary>
                <App />
              </ErrorBoundary>
            </NotificationProvider>
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>
);

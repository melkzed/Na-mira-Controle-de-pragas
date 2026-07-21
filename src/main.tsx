import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import { router } from './App';
import { Toaster } from './presentation/components/ui/Toaster';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/* reducedMotion="user" faz todas as animações respeitarem o
        prefers-reduced-motion do sistema operacional. */}
    <MotionConfig reducedMotion="user">
      <RouterProvider router={router} future={{ v7_startTransition: true }} />
      <Toaster />
    </MotionConfig>
  </React.StrictMode>,
);

// PWA: registra o service worker apenas em produção (evita cache no dev).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* falha no registro do SW não deve quebrar o app */
    });
  });
}

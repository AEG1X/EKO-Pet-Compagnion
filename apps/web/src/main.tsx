import '@fontsource-variable/manrope';
import './styles/global.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppGate } from './app/AppGate';
import { router } from './app/router';
import { ApiError } from './lib/api';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Pas de nouvelle tentative sur une erreur d'accès : l'écran adapté s'affiche directement.
      retry: (count, error) => !(error instanceof ApiError && error.status > 0 && error.status < 500) && count < 2,
      refetchOnWindowFocus: true,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AppGate>
        <RouterProvider router={router} />
      </AppGate>
    </QueryClientProvider>
  </StrictMode>,
);

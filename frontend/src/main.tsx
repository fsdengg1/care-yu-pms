import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/inter/latin.css';
import { applyAppearance, getStoredAppearance } from '@/lib/theme';
import App from './App';

applyAppearance(getStoredAppearance());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

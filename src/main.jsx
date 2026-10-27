import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import App from './App.jsx';
import { applyTheme, savedTheme } from './lib/clubs';

// Paint the saved club colours before React loads, so there's no flash of the wrong theme.
const saved = savedTheme();
applyTheme(saved.club || null, saved.pref || 'dark');

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

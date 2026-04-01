import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { migrateLegacyStoragePrefixes, migrateToIndexedDB } from './services/migration';

// Rename legacy app storage keys, then localStorage → IndexedDB, before stores hydrate
migrateLegacyStoragePrefixes()
  .then(() => migrateToIndexedDB())
  .then(async () => {
    const { default: App } = await import('./App');
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  });

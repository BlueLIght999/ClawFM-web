import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { AppProviders } from './contexts/AppProviders.jsx';
import './styles/global.css';

// Composition root: AppProviders owns the single useSocket() instance and
// the full provider tree (Strangler Fig facade). App receives socket /
// connected via a render-prop so it keeps its existing prop signature
// without creating a second socket connection (Phase 8 strangler-fig step).
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AppProviders>
        {({ socket, connected }) => <App socket={socket} connected={connected} />}
      </AppProviders>
    </ErrorBoundary>
  </React.StrictMode>
);

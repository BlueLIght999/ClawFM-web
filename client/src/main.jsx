import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { AuthProvider } from './contexts/AuthContext.jsx';
import { RadioProvider, useRadio } from './contexts/RadioContext.jsx';
import { ChatProvider } from './contexts/ChatContext.jsx';
import { ColdStartProvider } from './contexts/ColdStartContext.jsx';
import { CrabProvider } from './contexts/CrabContext.jsx';
import { UIProvider } from './contexts/UIContext.jsx';
import { useSocket } from './hooks/useSocket.js';
import './styles/global.css';

// Composition root: lift useSocket() above App so the single socket instance
// can be shared with AuthProvider (which needs it for auth emits) and App
// (which needs it for all radio/chat/crab events). This avoids a duplicate
// socket connection and resolves the parent/child dependency introduced by
// App consuming useAuth() (Phase 1 strangler-fig step).
function AppWithProviders() {
  const { socket, connected } = useSocket();
  return (
    <AuthProvider socket={socket}>
      <RadioProvider socket={socket}>
        <ChatProvider socket={socket}>
          <ColdStartProvider>
            <CrabProviderWrapper>
              <UIProvider socket={socket}>
                <App socket={socket} connected={connected} />
              </UIProvider>
            </CrabProviderWrapper>
          </ColdStartProvider>
        </ChatProvider>
      </RadioProvider>
    </AuthProvider>
  );
}

// Bridge: consume RadioContext to pass isPlaying to CrabProvider
function CrabProviderWrapper({ children }) {
  const { radioState } = useRadio();
  return <CrabProvider isPlaying={radioState.isPlaying}>{children}</CrabProvider>;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AppWithProviders />
    </ErrorBoundary>
  </React.StrictMode>
);

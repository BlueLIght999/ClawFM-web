import { AuthProvider, useAuth } from './AuthContext.jsx';
import { RadioProvider, useRadio } from './RadioContext.jsx';
import { ChatProvider } from './ChatContext.jsx';
import { ColdStartProvider } from './ColdStartContext.jsx';
import { CrabProvider } from './CrabContext.jsx';
import { UIProvider } from './UIContext.jsx';
import { useSocket } from '../hooks/useSocket.js';

/**
 * AppProviders — composition root for all Context providers.
 *
 * This is the "facade" in the Strangler Fig pattern:
 * wraps the entire app in the new provider tree.
 *
 * Provider order matters: outer providers cannot depend on inner ones.
 * CrabProvider needs isPlaying from RadioContext, so CrabProviderWrapper
 * consumes RadioContext to bridge the dependency.
 * ColdStartProvider needs loggedIn from AuthContext, so ColdStartBridge
 * consumes AuthContext to bridge the dependency.
 *
 * Render-prop support: if `children` is a function, it is invoked with
 * `{ socket, connected }` so the inner App component can keep its existing
 * prop signature without creating a second socket connection. This is the
 * single place where useSocket() is called.
 */
export function AppProviders({ children }) {
  const { socket, connected } = useSocket();
  return (
    <AuthProvider socket={socket}>
      <RadioProvider socket={socket}>
        <ChatProvider socket={socket}>
          <ColdStartBridge socket={socket} connected={connected}>
            <CrabProviderWrapper>
              <UIProvider socket={socket}>
                {typeof children === 'function' ? children({ socket, connected }) : children}
              </UIProvider>
            </CrabProviderWrapper>
          </ColdStartBridge>
        </ChatProvider>
      </RadioProvider>
    </AuthProvider>
  );
}

// Bridge: consume AuthContext to pass loggedIn to ColdStartProvider
function ColdStartBridge({ socket, connected, children }) {
  const { loggedIn } = useAuth();
  return (
    <ColdStartProvider socket={socket} connected={connected} loggedIn={loggedIn}>
      {children}
    </ColdStartProvider>
  );
}

// Bridge: consume RadioContext to pass isPlaying to CrabProvider
function CrabProviderWrapper({ children }) {
  const { radioState } = useRadio();
  return <CrabProvider isPlaying={radioState.isPlaying}>{children}</CrabProvider>;
}

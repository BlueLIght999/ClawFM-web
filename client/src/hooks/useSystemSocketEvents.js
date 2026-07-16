import { useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useUI } from '../contexts/UIContext.jsx';
import { useColdStart } from '../contexts/ColdStartContext.jsx';

const E = {
  LOGIN_REQUIRED: 'radio:login-required',
  PLAN_UPDATE: 'plan:update',
  ERROR: 'radio:error',
};

export function useSystemSocketEvents(socket) {
  const { setLoggedIn } = useAuth();
  const { setPlan, setError, setTtsStatus } = useUI();
  const { setColdPhaseText, setColdOpenText } = useColdStart();

  useEffect(() => {
    if (!socket) return;

    socket.on(E.LOGIN_REQUIRED, () => setLoggedIn(false));
    socket.on('auth:login-success', () => setLoggedIn(true));
    socket.on(E.PLAN_UPDATE, (data) => setPlan(data));
    socket.on(E.ERROR, (err) => {
      setError(err.message);
      setTimeout(() => setError(null), 5000);
    });
    socket.on('tts:status', (data) => setTtsStatus(data));
    socket.on('cold-start:phase', (data) => {
      if (data.phase === 'writing') { setColdPhaseText('CLAWED is writing the opening...'); setColdOpenText(''); }
      else if (data.phase === 'speaking') { setColdPhaseText('CLAWED is about to speak...'); setColdOpenText(''); }
      else if (data.phase === 'text-only') {
        if (data.text) {
          setColdOpenText(data.text);
          setColdPhaseText('');
        } else {
          setColdPhaseText('Technical difficulties — starting music...');
          setColdOpenText('');
        }
      }
    });

    return () => {
      socket.off(E.LOGIN_REQUIRED);
      socket.off('auth:login-success');
      socket.off(E.PLAN_UPDATE);
      socket.off(E.ERROR);
      socket.off('tts:status');
      socket.off('cold-start:phase');
    };
  }, [socket, setLoggedIn, setPlan, setError, setTtsStatus, setColdPhaseText, setColdOpenText]);
}

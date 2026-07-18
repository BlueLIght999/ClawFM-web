import { lazy, Suspense } from 'react';

const ProfileView = lazy(() => import('./ProfileView.jsx'));
const SettingsView = lazy(() => import('./SettingsView.jsx'));

export function ViewFallback() {
  return (
    <div style={{
      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'var(--font-pixel)', fontSize: 10, color: 'var(--text-dim)', letterSpacing: '2px',
    }}>
      <span className="cursor-blink">LOADING...</span>
    </div>
  );
}

export function ViewRouter({
  view,
  isViewTransitionPending,
  profileData,
  plan,
  socket,
  radioState,
  theme,
  override,
  setThemeOverride,
  clearOverride,
  proactiveEnabled,
  onProactiveToggle,
  onSetMode,
  ttsStatus,
  setPlan,
}) {
  return (
    <>
      {isViewTransitionPending && (
        <div style={{
          position: 'fixed', top: 24, left: '50%', transform: 'translateX(-50%)',
          fontFamily: 'var(--font-pixel)', fontSize: 8, color: 'var(--accent)',
          letterSpacing: '2px', zIndex: 100, pointerEvents: 'none',
        }}>
          <span className="cursor-blink">SWITCHING...</span>
        </div>
      )}

      {view === 'profile' && (
        <Suspense fallback={<ViewFallback />}>
          <ProfileView
            profileData={profileData}
            plan={plan}
            socket={socket}
            onRefreshPlan={() => {
              fetch('/api/plan/today?force=true').then(r => r.json()).then(data => {
                if (data.blocks) setPlan(data);
              }).catch(() => {});
            }}
          />
        </Suspense>
      )}

      {view === 'settings' && (
        <Suspense fallback={<ViewFallback />}>
          <SettingsView
            queueMode={radioState.queueMode}
            onSetMode={onSetMode}
            proactiveEnabled={proactiveEnabled}
            onProactiveToggle={onProactiveToggle}
            theme={theme}
            override={override}
            setThemeOverride={setThemeOverride}
            clearOverride={clearOverride}
            ttsStatus={ttsStatus}
          />
        </Suspense>
      )}
    </>
  );
}

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ViewRouter, ViewFallback } from '../components/ViewRouter.jsx';

vi.mock('../components/ProfileView.jsx', () => ({
  default: ({ profileData, plan, socket, onRefreshPlan }) => (
    <div data-testid="profile-view" data-has-plan={String(!!plan)} data-has-socket={String(!!socket)} />
  ),
}));
vi.mock('../components/SettingsView.jsx', () => ({
  default: ({ queueMode, theme, ttsStatus }) => (
    <div data-testid="settings-view" data-mode={queueMode} data-theme={theme} data-tts={ttsStatus} />
  ),
}));

describe('ViewFallback', () => {
  it('rendersLoadingText', () => {
    render(<ViewFallback />);
    expect(screen.getByText('LOADING...')).toBeInTheDocument();
  });
});

describe('ViewRouter', () => {
  const defaultProps = {
    view: 'player',
    isViewTransitionPending: false,
    profileData: null,
    plan: null,
    socket: { emit: vi.fn() },
    radioState: { queueMode: 'normal' },
    theme: 'dark',
    override: null,
    setThemeOverride: vi.fn(),
    clearOverride: vi.fn(),
    proactiveEnabled: false,
    onProactiveToggle: vi.fn(),
    onSetMode: vi.fn(),
    ttsStatus: 'ok',
    setPlan: vi.fn(),
  };

  it('rendersNothing_whenViewIsPlayer', () => {
    const { container } = render(<ViewRouter {...defaultProps} view="player" />);
    expect(container.querySelector('[data-testid="profile-view"]')).toBeNull();
    expect(container.querySelector('[data-testid="settings-view"]')).toBeNull();
  });

  it('rendersProfileView_whenViewIsProfile', async () => {
    render(<ViewRouter {...defaultProps} view="profile" plan={{ blocks: [] }} />);
    expect(await screen.findByTestId('profile-view')).toBeInTheDocument();
  });

  it('rendersSettingsView_whenViewIsSettings', async () => {
    render(<ViewRouter {...defaultProps} view="settings" />);
    expect(await screen.findByTestId('settings-view')).toBeInTheDocument();
  });

  it('rendersSwitchingIndicator_whenTransitionPending', () => {
    render(<ViewRouter {...defaultProps} isViewTransitionPending={true} />);
    expect(screen.getByText('SWITCHING...')).toBeInTheDocument();
  });

  it('doesNotRenderSwitchingIndicator_whenNotPending', () => {
    render(<ViewRouter {...defaultProps} isViewTransitionPending={false} />);
    expect(screen.queryByText('SWITCHING...')).toBeNull();
  });

  it('passesSettingsProps_toSettingsView', () => {
    render(
      <ViewRouter
        {...defaultProps}
        view="settings"
        radioState={{ queueMode: 'shuffle' }}
        theme="warm"
        ttsStatus="error"
      />,
    );
    const settings = screen.getByTestId('settings-view');
    expect(settings.dataset.mode).toBe('shuffle');
    expect(settings.dataset.theme).toBe('warm');
    expect(settings.dataset.tts).toBe('error');
  });
});

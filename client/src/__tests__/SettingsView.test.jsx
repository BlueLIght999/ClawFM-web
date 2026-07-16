import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

describe('SettingsView', () => {
  const defaultProps = {
    queueMode: 'shuffle',
    onSetMode: vi.fn(),
    proactiveEnabled: true,
    onProactiveToggle: vi.fn(),
    theme: 'night',
    override: null,
    setThemeOverride: vi.fn(),
    clearOverride: vi.fn(),
    ttsStatus: { available: true, provider: 'dashscope', reason: '' },
  };

  it('renders queue mode buttons', async () => {
    const { default: SettingsView } = await import('../components/SettingsView.jsx');
    render(<SettingsView {...defaultProps} />);
    expect(screen.getByText('SEQUENTIAL')).toBeInTheDocument();
    expect(screen.getByText('SHUFFLE')).toBeInTheDocument();
    expect(screen.getByText('FM')).toBeInTheDocument();
  });

  it('calls onSetMode when mode button clicked', async () => {
    const { default: SettingsView } = await import('../components/SettingsView.jsx');
    const onSetMode = vi.fn();
    render(<SettingsView {...defaultProps} onSetMode={onSetMode} />);
    fireEvent.click(screen.getByText('SEQUENTIAL'));
    expect(onSetMode).toHaveBeenCalledWith('sequential');
  });

  it('renders theme buttons', async () => {
    const { default: SettingsView } = await import('../components/SettingsView.jsx');
    render(<SettingsView {...defaultProps} />);
    expect(screen.getByText(/MORNING/)).toBeInTheDocument();
    expect(screen.getByText(/AFTERNOON/)).toBeInTheDocument();
    expect(screen.getByText(/NIGHT/)).toBeInTheDocument();
  });

  it('shows proactive toggle ON when enabled', async () => {
    const { default: SettingsView } = await import('../components/SettingsView.jsx');
    render(<SettingsView {...defaultProps} proactiveEnabled={true} />);
    expect(screen.getByText('ON')).toBeInTheDocument();
  });

  it('calls onProactiveToggle when toggle clicked', async () => {
    const { default: SettingsView } = await import('../components/SettingsView.jsx');
    const onProactiveToggle = vi.fn();
    render(<SettingsView {...defaultProps} onProactiveToggle={onProactiveToggle} />);
    fireEvent.click(screen.getByText('ON'));
    expect(onProactiveToggle).toHaveBeenCalled();
  });

  it('displays TTS DashScope provider status', async () => {
    const { default: SettingsView } = await import('../components/SettingsView.jsx');
    render(<SettingsView {...defaultProps} ttsStatus={{ available: true, provider: 'dashscope', reason: '' }} />);
    expect(screen.getByText(/DashScope/)).toBeInTheDocument();
  });

  it('displays TTS offline status', async () => {
    const { default: SettingsView } = await import('../components/SettingsView.jsx');
    render(<SettingsView {...defaultProps} ttsStatus={{ available: false, provider: null, reason: 'no key' }} />);
    expect(screen.getByText(/Offline/)).toBeInTheDocument();
  });
});

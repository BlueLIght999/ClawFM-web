import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import TopBar from '../components/TopBar.jsx';

describe('TopBar', () => {
  it('rendersStickyAgentRadioStructure_andAccessibleStatus', () => {
    const { container } = render(
      <TopBar radioName="QCLAUDIO" freq="88.7" connected view="player"
        onViewChange={vi.fn()} weather="Clear" ttsStatus={{ available: true, provider: 'dashscope' }} />
    );

    expect(container.firstChild).toHaveClass('agent-radio-topbar');
    expect(screen.getByRole('button', { name: 'FM' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Server connected')).toBeInTheDocument();
    expect(screen.getByLabelText('TTS: dashscope')).toBeInTheDocument();
  });
});

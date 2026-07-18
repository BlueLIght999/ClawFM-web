import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AgentStage } from '../components/agent-radio/AgentStage.jsx';

describe('AgentStage', () => {
  it('rendersCrabDialogAndChat_withoutOwningBusinessState', () => {
    render(
      <AgentStage
        crab={<span>crab</span>}
        dialog={<span>dialog</span>}
        chat={<span>chat</span>}
        chatOpen
      />
    );

    expect(screen.getByText('crab')).toBeInTheDocument();
    expect(screen.getByText('dialog')).toBeInTheDocument();
    expect(screen.getByText('chat')).toBeInTheDocument();
    expect(screen.getByTestId('agent-stage')).toHaveClass('is-chat-open');
  });
});

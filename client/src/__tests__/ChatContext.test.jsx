import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChatProvider, useChat } from '../contexts/ChatContext.jsx';

// Mock useChatHistory to avoid socket dependency
vi.mock('../hooks/useChatHistory.js', () => ({
  useChatHistory: () => {
    const [msgs, setMsgs] = require('react').useState([]);
    return [msgs, setMsgs];
  },
}));

function TestConsumer() {
  const {
    chatMessages, chatOpen, setChatOpen,
    djDialogVisible, sendMessage, hideDJDialog,
  } = useChat();
  return (
    <div>
      <span data-testid="msg-count">{chatMessages.length}</span>
      <span data-testid="chat-open">{String(chatOpen)}</span>
      <span data-testid="dj-visible">{String(djDialogVisible)}</span>
      <button onClick={() => setChatOpen(true)}>Open</button>
      <button onClick={() => sendMessage('hello')}>Send</button>
      <button onClick={hideDJDialog}>HideDJ</button>
    </div>
  );
}

describe('ChatContext', () => {
  it('initializes with empty messages and closed chat', () => {
    render(<ChatProvider socket={null}><TestConsumer /></ChatProvider>);
    expect(screen.getByTestId('msg-count').textContent).toBe('0');
    expect(screen.getByTestId('chat-open').textContent).toBe('false');
    expect(screen.getByTestId('dj-visible').textContent).toBe('false');
  });

  it('sendMessage adds user message and emits chat:message', () => {
    const emit = vi.fn();
    render(<ChatProvider socket={{ emit }}><TestConsumer /></ChatProvider>);
    fireEvent.click(screen.getByText('Send'));
    expect(screen.getByTestId('msg-count').textContent).toBe('1');
    expect(emit).toHaveBeenCalledWith('chat:message', { text: 'hello' });
  });

  it('hideDJDialog sets visible to false', () => {
    render(<ChatProvider socket={null}><TestConsumer /></ChatProvider>);
    fireEvent.click(screen.getByText('HideDJ'));
    expect(screen.getByTestId('dj-visible').textContent).toBe('false');
  });

  it('hides DJ dialog when chat opens', () => {
    render(<ChatProvider socket={null}><TestConsumer /></ChatProvider>);
    fireEvent.click(screen.getByText('Open'));
    expect(screen.getByTestId('chat-open').textContent).toBe('true');
    expect(screen.getByTestId('dj-visible').textContent).toBe('false');
  });
});

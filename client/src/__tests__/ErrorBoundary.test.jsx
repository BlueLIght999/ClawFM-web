import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ErrorBoundary from '../components/ErrorBoundary.jsx';

function ThrowOnRender({ error }) {
  if (error) throw new Error('Test explosion');
  return <div>OK</div>;
}

describe('ErrorBoundary', () => {
  it('renders children when no error', () => {
    render(
      <ErrorBoundary>
        <ThrowOnRender error={false} />
      </ErrorBoundary>
    );
    expect(screen.getByText('OK')).toBeInTheDocument();
  });

  it('renders fallback UI when child throws', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <ThrowOnRender error={true} />
      </ErrorBoundary>
    );
    expect(screen.getByText(/SIGNAL Lost/i)).toBeInTheDocument();
    expect(screen.getByText(/Test explosion/i)).toBeInTheDocument();
    spy.mockRestore();
  });

  it('renders custom fallback when provided', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary fallback={<div>Custom Error</div>}>
        <ThrowOnRender error={true} />
      </ErrorBoundary>
    );
    expect(screen.getByText('Custom Error')).toBeInTheDocument();
    spy.mockRestore();
  });

  it('shows retry button that clears error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { rerender } = render(
      <ErrorBoundary>
        <ThrowOnRender error={true} />
      </ErrorBoundary>
    );
    expect(screen.getByText(/RETRY/i)).toBeInTheDocument();
    spy.mockRestore();
    rerender(
      <ErrorBoundary key="fresh">
        <ThrowOnRender error={false} />
      </ErrorBoundary>
    );
    expect(screen.getByText('OK')).toBeInTheDocument();
  });
});

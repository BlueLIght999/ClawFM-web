import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock DJSchedule to isolate ProfileView tests
vi.mock('../components/DJSchedule.jsx', () => ({
  default: ({ plan }) => (
    <div data-testid="dj-schedule">{plan ? 'has-plan' : 'no-plan'}</div>
  ),
}));

describe('ProfileView', () => {
  it('renders profile data when provided', async () => {
    const { default: ProfileView } = await import('../components/ProfileView.jsx');
    const profileData = {
      currentMood: 'happy',
      totalSongs: 42,
      topArtists: [{ name: 'Artist1' }, { name: 'Artist2' }],
    };
    render(<ProfileView profileData={profileData} plan={null} socket={null} onRefreshPlan={vi.fn()} />);
    expect(screen.getByText('happy')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText(/Artist1/)).toBeInTheDocument();
  });

  it('shows loading state when profileData is null', async () => {
    const { default: ProfileView } = await import('../components/ProfileView.jsx');
    render(<ProfileView profileData={null} plan={null} socket={null} onRefreshPlan={vi.fn()} />);
    expect(screen.getByText('Loading taste data...')).toBeInTheDocument();
  });

  it('passes plan to DJSchedule', async () => {
    const { default: ProfileView } = await import('../components/ProfileView.jsx');
    const plan = { blocks: [], activeBlockIndex: 0 };
    render(<ProfileView profileData={null} plan={plan} socket={null} onRefreshPlan={vi.fn()} />);
    expect(screen.getByTestId('dj-schedule')).toHaveTextContent('has-plan');
  });

  it('renders header PROFILE & SCHEDULE', async () => {
    const { default: ProfileView } = await import('../components/ProfileView.jsx');
    render(<ProfileView profileData={null} plan={null} socket={null} onRefreshPlan={vi.fn()} />);
    expect(screen.getByText('PROFILE & SCHEDULE')).toBeInTheDocument();
  });
});

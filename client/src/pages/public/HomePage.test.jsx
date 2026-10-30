import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import HomePage from './HomePage';

const { mockGet } = vi.hoisted(() => ({ mockGet: vi.fn() }));

vi.mock('../../lib/api', () => ({
  default: { get: mockGet },
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: null }),
  dashboardPath: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('HomePage', () => {
  it('renders safely when content endpoints omit their list fields', async () => {
    mockGet.mockResolvedValue({ data: {} });

    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    );

    expect(
      await screen.findByText('Learning paths are being prepared. Browse individual courses in the meantime.')
    ).toBeInTheDocument();
  });
});

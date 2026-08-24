---
name: generate-tests
description: Test generation patterns for NetPrime-Party. Use when creating tests for components, hooks, services, or utilities.
---

# Test Generation Patterns

## Test Structure

```
src/
├── components/
│   └── movie/
│       ├── MovieCard.tsx
│       └── MovieCard.test.tsx      # Component tests
├── hooks/
│   ├── useAuth.ts
│   └── useAuth.test.ts             # Hook tests
├── services/
│   ├── api.ts
│   └── api.test.ts                 # Service tests
└── utils/
    ├── formatters.ts
    └── formatters.test.ts          # Utility tests
```

## Testing Stack

- **Jest** - Test runner
- **@testing-library/react-native** - Component testing
- **@testing-library/jest-native** - Custom matchers
- **msw** (Mock Service Worker) - API mocking

## Component Test Template

```tsx
// MovieCard.test.tsx
import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { MovieCard } from './MovieCard';

const mockMovie = {
  id: '1',
  title: 'Test Movie',
  posterUrl: 'https://example.com/poster.jpg',
  year: 2024,
  rating: 8.5,
};

describe('MovieCard', () => {
  it('renders movie title and year', () => {
    const { getByText } = render(<MovieCard movie={mockMovie} />);
    expect(getByText('Test Movie')).toBeTruthy();
    expect(getByText('2024')).toBeTruthy();
  });

  it('calls onPress when pressed', () => {
    const onPress = jest.fn();
    const { getByProps } = render(<MovieCard movie={mockMovie} onPress={onPress} />);
    
    act(() => {
      fireEvent.press(getByProps({ testID: 'movie-card' }));
    });
    
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('shows rating with star icon', () => {
    const { getByText } = render(<MovieCard movie={mockMovie} />);
    expect(getByText('8.5')).toBeTruthy();
  });

  it('handles missing poster gracefully', () => {
    const { getByTestId } = render(
      <MovieCard movie={{ ...mockMovie, posterUrl: null }} />
    );
    expect(getByTestId('placeholder-image')).toBeTruthy();
  });
});
```

## Hook Test Template

```ts
// useAuth.test.ts
import { act, renderHook } from '@testing-library/react';
import { useAuth } from './useAuth';
import { AuthProvider } from '@/context/AuthContext';

// Mock dependencies
jest.mock('@/services/auth', () => ({
  login: jest.fn(),
  logout: jest.fn(),
  refreshToken: jest.fn(),
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <AuthProvider>{children}</AuthProvider>
);

describe('useAuth', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns initial unauthenticated state', () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.user).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('logs in and sets user', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    
    await act(async () => {
      await result.current.login('test@example.com', 'password');
    });
    
    expect(result.current.user).toEqual({ email: 'test@example.com' });
  });

  it('handles login error', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    // Mock login to reject
    require('@/services/auth').login.mockRejectedValueOnce(new Error('Invalid credentials'));
    
    await expect(
      act(async () => {
        await result.current.login('test@example.com', 'wrong');
      })
    ).rejects.toThrow('Invalid credentials');
  });
});
```

## Service Test Template

```ts
// api.test.ts
import { api } from './api';

// Mock fetch globally
global.fetch = jest.fn();

describe('api service', () => {
  beforeEach(() => {
    (fetch as jest.Mock).mockClear();
  });

  it('GET requests with auth header', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: 'test' }),
    });

    const result = await api.get('/movies/popular');

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/movies/popular'),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: expect.stringMatching(/^Bearer /),
        }),
      })
    );
    expect(result).toEqual({ data: 'test' });
  });

  it('throws on non-ok response', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    await expect(api.get('/movies/999')).rejects.toThrow('Failed to fetch');
  });

  it('retries on 401 with token refresh', async () => {
    (fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: false, status: 401 })  // First call fails
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ data: 'refreshed' }) }); // Retry succeeds

    // Mock token refresh
    jest.mock('@/services/auth', () => ({
      refreshToken: jest.fn().mockResolvedValue(undefined),
    }));

    const result = await api.get('/movies/popular');
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ data: 'refreshed' });
  });
});
```

## Utility Test Template

```ts
// formatters.test.ts
import { formatDuration, formatRating, truncateText } from './formatters';

describe('formatters', () => {
  describe('formatDuration', () => {
    it('formats minutes to hours', () => {
      expect(formatDuration(130)).toBe('2h 10m');
      expect(formatDuration(90)).toBe('1h 30m');
      expect(formatDuration(45)).toBe('45m');
    });

    it('handles edge cases', () => {
      expect(formatDuration(0)).toBe('0m');
      expect(formatDuration(-10)).toBe('0m');
    });
  });

  describe('formatRating', () => {
    it('formats to one decimal', () => {
      expect(formatRating(8.5)).toBe('8.5');
      expect(formatRating(7)).toBe('7.0');
      expect(formatRating(9.99)).toBe('10.0');
    });
  });

  describe('truncateText', () => {
    it('truncates long text', () => {
      expect(truncateText('Hello World', 8)).toBe('Hello...');
      expect(truncateText('Hi', 10)).toBe('Hi');
    });
  });
});
```

## Running Tests

```bash
# All tests
npm test

# Watch mode
npm test -- --watch

# Coverage
npm test -- --coverage

# Single file
npm test -- MovieCard.test.tsx
```

## Best Practices

1. **Test behavior, not implementation** - Test what the user sees/experiences
2. **One concept per test** - Clear failure messages
3. **Mock at module boundary** - Don't mock internal functions
4. **Use `act()` for state updates** - Avoid warnings
5. **Descriptive test names** - `should X when Y`
6. **Arrange-Act-Assert** structure
7. **Clean up mocks** in `beforeEach`/`afterEach`
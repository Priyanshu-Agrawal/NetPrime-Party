---
name: netprime-patterns
description: NetPrime-Party project-specific conventions, architecture, and patterns. Use when working on this codebase to follow established patterns.
---

# NetPrime-Party Project Conventions

## Tech Stack

- **Framework**: Expo (React Native) with Expo Router
- **Language**: TypeScript (strict)
- **Styling**: StyleSheet + Theme constants
- **State**: React Context + TanStack Query
- **Navigation**: Expo Router (file-based)
- **Video Player**: expo-av / custom player
- **Auth**: Custom JWT + Refresh tokens
- **API**: REST + WebSocket for parties

## Key Directories

```
NetPrime-Party/
├── app/                    # Expo Router screens
│   ├── (auth)/            # Auth screens (login, signup)
│   ├── (tabs)/            # Main tab screens
│   ├── party/             # Party screens
│   └── _layout.tsx        # Root layout
├── src/
│   ├── components/        # Shared components
│   │   ├── ui/            # Base UI (Button, Card, Input)
│   │   ├── movie/         # Movie-specific (MovieCard, MovieRow)
│   │   ├── party/         # Party components
│   │   └── player/        # Video player components
│   ├── hooks/             # Custom hooks
│   ├── context/           # AuthContext, PartyContext, ThemeContext
│   ├── services/          # api.ts, auth.ts, party.ts, storage.ts
│   ├── utils/             # formatters, validators, helpers
│   ├── constants/         # theme.ts, config.ts, endpoints.ts
│   ├── types/             # Global types
│   └── navigation/        # Typed navigation helpers
├── android/               # Native Android (Kotlin)
├── ios/                   # Native iOS (Swift)
└── opencode/              # Agent config (agents, tools, skills)
```

## Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Components | PascalCase | `MovieCard.tsx`, `PartyInviteModal.tsx` |
| Hooks | camelCase + `use` | `useAuth.ts`, `usePartySocket.ts` |
| Services | camelCase + `.ts` | `api.ts`, `authService.ts` |
| Constants | UPPER_SNAKE_CASE | `API_BASE_URL`, `THEME_COLORS` |
| Types/Interfaces | PascalCase | `Movie`, `Party`, `UserProfile` |
| Screens | PascalCase + `Screen` | `HomeScreen.tsx`, `MovieDetailsScreen.tsx` |

## Theme System

```ts
// src/constants/theme.ts
export const COLORS = {
  primary: '#E50914',      // Netflix red
  background: '#141414',   // Dark background
  surface: '#1F1F1F',      // Card background
  text: '#FFFFFF',
  textSecondary: '#B3B3B3',
  border: '#333333',
  error: '#E50914',
  success: '#46D369',
};

export const SPACING = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };
export const RADIUS = { sm: 4, md: 8, lg: 12, xl: 16 };
export const TYPOGRAPHY = {
  h1: { fontSize: 32, fontWeight: '700' },
  h2: { fontSize: 24, fontWeight: '600' },
  body: { fontSize: 16, fontWeight: '400' },
  caption: { fontSize: 12, fontWeight: '400' },
};
```

## Authentication Flow

```ts
// src/context/AuthContext.tsx
interface AuthState {
  user: User | null;
  tokens: { access: string; refresh: string } | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshToken: () => Promise<void>;
}

// Tokens stored in SecureStore (expo-secure-store)
// Auto-refresh on 401 via api.ts interceptor
```

## Party System

- **WebSocket** for real-time sync (play/pause/seek)
- **Party Code**: 6-char alphanumeric
- **Host Controls**: Only host can control playback
- **State**: `{ movieId, position, isPlaying, users[] }`

## API Conventions

```ts
// src/services/api.ts
const API_BASE = 'https://api.netprime.example.com/v1';

export const api = {
  get: <T>(endpoint: string) => fetchWithAuth<T>(endpoint),
  post: <T>(endpoint: string, body: unknown) => fetchWithAuth<T>(endpoint, { method: 'POST', body: JSON.stringify(body) }),
  // ...
};

// All calls include Authorization header
// Auto-retry on 401 with refresh token
```

## Video Player

- **Component**: `src/components/player/VideoPlayer.tsx`
- **Props**: `source`, `partyId?`, `isHost?`
- **Controls**: Custom overlay (play/pause, seek, speed, fullscreen)
- **Party Sync**: Listen to WebSocket for `seek`, `play`, `pause` events

## Error Handling

- **API Errors**: Toast via `react-native-toast-message`
- **Network**: Offline banner + retry queue
- **Crash**: Sentry (if configured) + ErrorBoundary

## Testing Patterns

```tsx
// Component test
import { render, fireEvent } from '@testing-library/react-native';
import { MovieCard } from '@/components/movie/MovieCard';

test('renders movie title', () => {
  const { getByText } = render(<MovieCard movie={{ id: '1', title: 'Test Movie' }} />);
  expect(getByText('Test Movie')).toBeTruthy();
});
```

## Git Workflow

- **Main branch**: `main`
- **Feature branches**: `feat/description`, `fix/description`
- **Commits**: Conventional commits (`feat:`, `fix:`, `chore:`)
- **PRs**: Required reviews + CI checks

## Environment Variables

```env
# .env (not committed)
EXPO_PUBLIC_API_URL=https://api.netprime.example.com/v1
EXPO_PUBLIC_WS_URL=wss://api.netprime.example.com/ws
EXPO_PUBLIC_SENTRY_DSN=
```

## Performance Budgets

- App launch: < 3s cold start
- Screen transitions: < 300ms
- List scrolling: 60fps
- Video start: < 2s
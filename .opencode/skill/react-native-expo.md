---
name: react-native-expo
description: React Native + Expo development patterns, conventions, and best practices for NetPrime-Party. Use when working on RN/Expo code: components, navigation, styling, state management, native modules, testing.
---

# React Native + Expo Development Patterns

## Project Structure

```
src/
├── components/       # Reusable UI components
├── screens/          # Screen components (Expo Router file-based)
├── navigation/       # Navigation utilities, types
├── hooks/            # Custom React hooks
├── context/          # React Context providers
├── services/         # API, storage, native services
├── utils/            # Helper functions
├── constants/        # App constants, theme
├── types/            # TypeScript types
└── assets/           # Images, fonts
```

## Coding Conventions

### Components
- **Functional components only** with TypeScript
- Use `StyleSheet.create` for styles
- Props interface named `ComponentNameProps`
- Default exports for screens, named exports for components

```tsx
// components/Button/Button.tsx
import { StyleSheet, TouchableOpacity, Text } from 'react-native';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
}

export const Button = ({ title, onPress, variant = 'primary' }: ButtonProps) => (
  <TouchableOpacity style={[styles.button, styles[variant]]} onPress={onPress}>
    <Text style={styles.text}>{title}</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  button: { paddingVertical: 12, paddingHorizontal: 24, borderRadius: 8 },
  primary: { backgroundColor: '#E50914' },
  secondary: { backgroundColor: '#333', borderWidth: 1, borderColor: '#555' },
  text: { color: '#fff', fontWeight: '600', fontSize: 16 },
});
```

### Navigation (Expo Router)
- File-based routing in `app/` directory
- Use typed routes: `href="/movie/(id)"`
- Stack, Tabs, Drawer layouts via `_layout.tsx`

### State Management
- **React Context** for global state (auth, theme, user preferences)
- **Zustand** for complex client state (if needed)
- **React Query / TanStack Query** for server state

### Styling
- **StyleSheet** for performance
- **Theme object** in `constants/theme.ts` for colors, spacing, typography
- Avoid inline styles

### TypeScript
- Strict mode enabled
- No `any` — use `unknown` or proper types
- Export types from `types/` barrel file

## Common Patterns

### API Calls
```ts
// services/api.ts
import { API_BASE } from '@/constants/config';

export async function fetchMovies(category: string) {
  const res = await fetch(`${API_BASE}/movies/${category}`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new Error('Failed to fetch');
  return res.json();
}
```

### Custom Hooks
```ts
// hooks/useMovies.ts
import { useQuery } from '@tanstack/react-query';
import { fetchMovies } from '@/services/api';

export function useMovies(category: string) {
  return useQuery({ queryKey: ['movies', category], queryFn: () => fetchMovies(category) });
}
```

### Native Modules (TurboModules)
- Kotlin (Android) / Swift (iOS) in `android/` / `ios/`
- TypeScript spec in `src/types/native.d.ts`
- Codegen via `expo-module.config.json`

## Testing
- **Jest + React Native Testing Library** for unit/component tests
- **Detox** for E2E (if configured)
- Test files: `*.test.tsx` alongside components

## Performance
- `React.memo` for list items
- `useMemo` / `useCallback` for expensive computations
- `FlashList` (Shopify) for large lists
- `useNativeDriver: true` for animations

## Debugging
- `react-native-ai-devtools` MCP (`execbro`) for bundle errors, logs
- Flipper / React Native Debugger
- `console.log` → Metro terminal
---
name: code-review
description: Code review patterns and checklist for NetPrime-Party. Use when reviewing PRs, writing code that needs review, or establishing review standards.
---

# Code Review Standards

## Review Checklist

### TypeScript & Types
- [ ] No `any` types (use `unknown`, generics, or proper types)
- [ ] All props have explicit interfaces
- [ ] No `@ts-ignore` without comment explaining why
- [ ] Strict null checks handled properly
- [ ] Exported types in `src/types/` barrel file

### React/React Native
- [ ] Functional components with hooks (no class components)
- [ ] `React.memo` for list items and pure presentational components
- [ ] `useCallback`/`useMemo` for callbacks passed to memoized children
- [ ] No inline styles (use StyleSheet)
- [ ] No inline event handlers in JSX (extract to handlers)
- [ ] Proper cleanup in `useEffect` (return function)
- [ ] Keys on list items (stable, unique IDs)

### Architecture
- [ ] Components in correct directory (`ui/`, `movie/`, `party/`, `player/`)
- [ ] Business logic in hooks/services, not components
- [ ] API calls in `services/`, not components
- [ ] Context used sparingly (auth, theme, party only)
- [ ] No direct native module imports in UI components

### Styling
- [ ] Uses theme constants (`COLORS`, `SPACING`, `RADIUS`, `TYPOGRAPHY`)
- [ ] No hardcoded colors, spacing, or font sizes
- [ ] Responsive via `Dimensions` or `useWindowDimensions`
- [ ] Dark mode only (app is dark-first)

### Performance
- [ ] `FlashList` for lists > 20 items
- [ ] Images: `resizeMode`, proper dimensions, caching
- [ ] Animations: `useNativeDriver: true` where possible
- [ ] No heavy computation in render

### Security
- [ ] No secrets in code (API keys, tokens)
- [ ] SecureStore for tokens (expo-secure-store)
- [ ] Input validation on forms
- [ ] No `eval` or `Function` constructor

### Testing
- [ ] Unit tests for hooks (`useAuth`, `useParty`)
- [ ] Component tests for complex UI
- [ ] Snapshot tests for stable UI
- [ ] Test file: `ComponentName.test.tsx`

### Git/PR
- [ ] Conventional commit messages
- [ ] PR description explains what/why
- [ ] Linked issue/ticket
- [ ] Screenshots for UI changes
- [ ] No commented-out code

## Review Comments Format

```markdown
## Summary
Brief overview of changes

## Concerns
- **TypeScript**: Line 42 - `any` type used for API response
- **Performance**: Line 15 - Inline style object creates new reference each render

## Suggestions
- Consider extracting `formatDuration` to `utils/formatters.ts`
- Add `React.memo` to `MovieCard` (re-renders on parent scroll)

## Approved
✅ Ready to merge
```

## Self-Review Before PR

Run locally:
```bash
npm run lint          # ESLint
npm run typecheck     # TypeScript
npm run test          # Jest
```

Fix all errors before pushing.
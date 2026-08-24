---
name: context7-mcp
description: Use Context7 to fetch current documentation for libraries, frameworks, and APIs. Activate for setup questions, code generation involving libraries, or mentions of specific frameworks like React, React Native, Expo, Prisma, Supabase, etc.
---

When the user asks about libraries, frameworks, or needs code examples, use Context7 to fetch current documentation instead of relying on training data.

## When to Use This Skill

Activate this skill when the user:
- Asks setup or configuration questions ("How do I configure Expo Router?")
- Requests code involving libraries ("Write a React Native Reanimated animation...")
- Needs API references ("What are the Supabase auth methods?")
- Mentions specific frameworks (React, React Native, Expo, Tailwind, Prisma, Supabase, etc.)

## How to Fetch Documentation

### Step 1: Resolve the Library ID

Call MCP `context7:resolve-library-id` with:
- `libraryName`: The library name extracted from the user's question
- `query`: What to look up in the library's documentation (improves relevance ranking)

### Step 2: Select the Best Match

From the resolution results, choose based on:
- Exact or closest name match to what the user asked for
- Higher benchmark scores indicate better documentation quality
- If the user mentioned a version (e.g., "React 19"), prefer version-specific IDs

### Step 3: Fetch the Documentation

Call MCP `context7:query-docs` with:
- `libraryId`: The selected Context7 library ID (e.g., `/expo/expo`, `/facebook/react-native`)
- `query`: What to look up in the library's documentation, scoped to a single concept

If the user's question spans multiple distinct concepts, make a separate `query-docs` call per concept with the same library ID.

### Step 4: Use the Documentation

Incorporate the fetched documentation into your response:
- Answer the user's question using current, accurate information
- Include relevant code examples from the docs
- Cite the library version when relevant

## Guidelines

- **Be specific**: Describe what to look up in the library's documentation, but keep each query to a single concept
- **One topic per query**: Split multi-topic questions into separate `query-docs` calls
- **Version awareness**: When users mention versions ("Expo 51", "React Native 0.76"), use version-specific library IDs if available
- **Prefer official sources**: When multiple matches exist, prefer official/primary packages over community forks
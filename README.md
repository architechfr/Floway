# Floway

MVP for reducing fuel-station waiting time by combining official station data, crowdsourced station events, and routing recommendations.

## Product promise

> Recommend the best upcoming fuel stop based on detour, price and estimated wait time.

## Current scaffold

- Domain model for stations, observations and recommendations
- Wait-time estimation algorithm
- Supabase/Postgres schema with RLS-ready tables
- Expo mobile app skeleton
- CI test workflow
- Product and architecture documentation

## Bootstrap

1. Create an Expo app in `apps/mobile` using the blank TypeScript template.
2. Install `@supabase/supabase-js`, `react-native-url-polyfill`, `expo-sqlite`, and `expo-location` with `npx expo install`.
3. Copy `.env.example` to `.env` and add Supabase credentials.
4. Apply `supabase/migrations/0001_initial_schema.sql` to the Supabase project.
5. Run `npm test` at repository root.

## Privacy principle

Do not persist a user's continuous location trail. Convert device location into coarse station events (enter, queue start, queue end, exit) as early as possible.

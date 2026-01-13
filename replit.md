# PingPoint Driver

## Overview

PingPoint Driver is a mobile GPS tracking and load management app for truck drivers. It features real-time location sharing, stop management (arrivals/departures), and a gamified PingPoints reward system. The app uses a retro-futuristic cyberpunk aesthetic with two themes: "Arcade 90s" (neon cyberpunk) and "Premium" (clean dark interface).

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework**: Expo (React Native) with TypeScript
- Entry point: `client/index.js` → `client/App.tsx`
- Uses React Navigation with a drawer-based navigation pattern
- Path aliases: `@/` maps to `./client/`, `@shared/` maps to `./shared/`

**Navigation Structure**:
- Root Stack Navigator wraps a Drawer Navigator
- Main screens: Dashboard, History, Logs, Settings
- Deep linking configured for:
  - `pingpoint://driver/:token` (custom scheme)
  - `https://6770693b-fc9a-4c02-9b92-87ade92b7c79-00-3kcz61rsl8wvd.worf.replit.dev/driver/:token` (production)
- Token format: `drv_[unique_id]`

**State Management**:
- React Context for driver state (`DriverProvider`) and theme state (`ThemeProvider`)
- TanStack React Query for server state/data fetching
- AsyncStorage for local persistence (tokens, settings, logs)

**Key Features**:
- GPS location tracking with background permissions
- Stop arrival/departure actions with point rewards
- Animated reward notifications
- Theme toggling between arcade and premium modes

### Backend Architecture

**Framework**: Express.js with TypeScript
- Entry point: `server/index.ts`
- Routes defined in `server/routes.ts`
- In-memory mock storage in `server/storage.ts`

**API Endpoints**:
- `GET /api/driver/:token` - Fetch driver's load data
- `POST /api/driver/:token/ping` - Receive GPS coordinates
- `POST /api/driver/:token/stops/:stopId/arrive` - Mark stop arrival
- `POST /api/driver/:token/stops/:stopId/depart` - Mark stop departure

### Database

**ORM**: Drizzle ORM with PostgreSQL
- Schema defined in `shared/schema.ts`
- Currently has a basic users table
- Main driver/load data uses in-memory mock storage (ready for database migration)

### Build System

- `npm run expo:dev` - Start Expo development server
- `npm run server:dev` - Start backend server with tsx
- `npm run db:push` - Push Drizzle schema to database
- Custom build script in `scripts/build.js` for deployment

## External Dependencies

**Mobile/UI**:
- expo-location for GPS tracking
- expo-haptics for tactile feedback
- react-native-reanimated for animations
- react-native-gesture-handler for swipe/drawer gestures

**Data**:
- @tanstack/react-query for API state management
- @react-native-async-storage/async-storage for local storage
- drizzle-orm with pg driver for PostgreSQL
- zod + drizzle-zod for schema validation

**Backend**:
- express for HTTP server
- http-proxy-middleware for development proxying
- ws for WebSocket support (future real-time features)

**Environment Variables**:
- `DATABASE_URL` - PostgreSQL connection string
- `EXPO_PUBLIC_DOMAIN` - API base URL for client
- `EXPO_PUBLIC_API_URL` - PingPoint backend API URL (currently: https://6770693b-fc9a-4c02-9b92-87ade92b7c79-00-3kcz61rsl8wvd.worf.replit.dev)
- `REPLIT_DEV_DOMAIN` - Development domain for CORS
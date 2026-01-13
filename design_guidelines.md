# PingPoint Driver - Design Guidelines

## Brand Identity

**App Purpose**: GPS tracking and load management app for truck drivers with a gamified points reward system.

**Visual Direction**: Retro-futuristic cyberpunk aesthetic with two distinct themes:
- **Arcade 90s**: Neon glows, high contrast, cyberpunk energy
- **Premium**: Clean dark interface, refined neon accents

**Memorable Element**: PingPoints reward system with animated point awards and balance display in header.

---

## Navigation Architecture

**Root Navigation**: Drawer (sliding from right)

**Screen Structure**:
- **Dashboard** (index) - Main load tracking screen with stops
- **History** - Completed loads list
- **Logs** - Detailed stop log with timestamps
- **Settings** - Theme toggle and preferences

---

## Color Palette

**Dark Theme Base**:
- Background: `#0a0a1f`
- Surface/Cards: Lighter variation of background with subtle borders

**Accents**:
- Cyan Primary: `#00d9ff` (status badges, buttons, glows, headers)
- Yellow Secondary: `#ffd700` (load numbers, action buttons)
- Purple/Magenta: Use for tertiary accents

**Semantic Colors**:
- Success: Cyan
- Warning: Yellow
- Completed: Greyed out with reduced opacity

---

## Typography

Use a bold, geometric sans-serif font that evokes retro-futuristic aesthetics.

**Type Scale**:
- Header Logo: Large, uppercase, bold (PINGPOINT DRIVER)
- Load Number: Bold, uppercase (#172703)
- Section Titles: Uppercase, medium weight (STOPS)
- Body Text: Regular weight for addresses and details
- Button Text: Uppercase, bold

---

## Screen Specifications

### Dashboard (Main Screen)

**Header** (non-scrollable, fixed):
- Left: Balance pill "Balance: 70" with cyan background, rounded
- Center: "PINGPOINT DRIVER" title with cyan subtitle below
- Right: Theme badge ("Arcade 90s"/"Premium") + hamburger menu icon (☰)
- Background: Dark, subtle gradient or solid

**Main Content** (scrollable):
- Safe area insets: top = headerHeight + 16px, bottom = 16px

**Reward Animation** (floating overlay):
- Large cyan button showing "+20 PINGPOINTS"
- Triggered on completion events
- Center screen, fades in/out with scale animation

**Load Card**:
- Yellow text: "LOAD #172703"
- Status badge with cyan border (PLANNED/IN TRANSIT/DELIVERED)
- Route display: "FROM → TO" format (Evansville → CARLSBAD)
- Yellow button: "Enable Location Sharing" (toggles GPS)
- Rounded corners, dark background, subtle border

**Stops Section**:
- Title "STOPS" in gray, uppercase
- Each stop as individual card:
  - Number badge (1, 2) or checkmark icon if completed
  - Type badge: PICKUP/DELIVERY
  - Company name (bold)
  - City, State
  - Full address
  - Date/time
  - Action button: "Arrive" or "Depart" (yellow background, rounded)
- Current stop: cyan glow effect around card
- Completed stops: reduced opacity, greyed text, checkmark badge

### Drawer Menu

**Slide from right, overlay on dashboard**:
- Dark background matching theme
- Menu items:
  - History (icon + label)
  - Logs (icon + label)
  - Settings (icon + label)
- Close button or swipe gesture

### History Screen

**Header**: Standard navigation header with back button, title "History"
**Content**: Scrollable list of completed loads with same card design as dashboard, status = DELIVERED

### Logs Screen

**Header**: Standard navigation header with back button, title "Logs"
**Content**: Scrollable list showing all stop events with timestamps, action type, location

### Settings Screen

**Header**: Standard navigation header with back button, title "Settings"
**Content**: Form layout with:
- Theme selector: Toggle between "Arcade 90s" and "Premium"
- Other settings placeholders

---

## Visual Design

**Card Style**:
- Rounded corners (12-16px radius)
- Dark background with subtle border
- Padding: 16-20px
- Neon glow for active elements (cyan, 4-8px blur in Arcade theme)

**Buttons**:
- Rounded pill shape
- Yellow background for primary actions
- Cyan background for secondary/status elements
- Uppercase bold text
- Subtle glow in Arcade theme
- Press feedback: slight scale down (0.95)

**Badges**:
- Rounded pill or small rounded rectangle
- Uppercase text
- Cyan border with transparent/dark background for status
- Solid background for numbers

**Theme Differences**:
- **Arcade 90s**: Neon glows on cards/buttons/badges, higher contrast, vibrant accents
- **Premium**: No glows, cleaner lines, same colors but more refined application

---

## Assets to Generate

**App Icon** (icon.png):
- Cyan/yellow neon "PP" logo or truck symbol on dark background
- WHERE USED: Device home screen

**Splash Icon** (splash-icon.png):
- Same as app icon or "PINGPOINT DRIVER" wordmark
- WHERE USED: App launch screen

**Empty State - History** (empty-history.png):
- Subtle illustration of empty road or completed deliveries icon
- WHERE USED: History screen when no completed loads

**Empty State - Logs** (empty-logs.png):
- Subtle logbook or timeline illustration
- WHERE USED: Logs screen when no events recorded

**Checkmark Icon** (checkmark.png):
- Circular cyan checkmark for completed stops
- WHERE USED: Stop cards in completed state
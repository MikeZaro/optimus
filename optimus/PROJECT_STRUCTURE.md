# Project Structure

## 📁 Complete File Tree

```
optimus/
├── 📄 QUICK_START.md              # Fast 5-minute setup guide
├── 📄 CLAUDE_CHAT_SETUP.md        # Detailed documentation
├── 📄 PROJECT_STRUCTURE.md        # This file
├── 📄 .env.example                # Environment variable template
├── 📄 .env.local                  # Your actual secrets (not in git)
├── 📄 package.json                # Dependencies & scripts
├── 📄 supabase-schema.sql         # Database schema
│
├── 📁 server/
│   └── 📄 server.js               # Express backend + Claude API
│
├── 📁 src/
│   ├── 📄 main.jsx                # App entry point with routing
│   ├── 📄 App.jsx                 # Productivity dashboard (existing)
│   ├── 📄 App.css                 # Dashboard styles
│   ├── 📄 ChatApp.jsx             # Chat app wrapper
│   ├── 📄 index.css               # Global styles
│   ├── 📄 supabaseClient.js       # Supabase config (existing)
│   │
│   └── 📁 components/
│       ├── 📄 ChatInterface.jsx   # Main chat UI component
│       ├── 📄 ChatInterface.css   # Chat UI styles
│       ├── 📄 AppNav.jsx          # Navigation between apps
│       └── 📄 AppNav.css          # Navigation styles
│
└── 📁 node_modules/               # Dependencies (auto-generated)
```

## 🎯 Key Files Explained

### Configuration Files
- **`.env.local`** - Your API keys and secrets (never commit this!)
- **`.env.example`** - Template showing what environment variables are needed
- **`package.json`** - Project dependencies and npm scripts

### Backend
- **`server/server.js`** - Express server that:
  - Handles `/api/chat` POST requests
  - Connects to Claude API
  - Saves/retrieves messages from Supabase
  - Maintains conversation context

### Frontend Components

**Main Apps:**
- **`App.jsx`** - Your existing productivity dashboard
- **`ChatApp.jsx`** - New Claude chat application

**Chat Components:**
- **`ChatInterface.jsx`** - Complete chat UI with:
  - Message display
  - User input
  - Loading states
  - Session management
  - Auto-scroll
- **`ChatInterface.css`** - Beautiful gradient design with responsive layout

**Shared Components:**
- **`AppNav.jsx`** - Navbar to switch between Dashboard and Chat
- **`main.jsx`** - Router logic to determine which app to show

### Database
- **`supabase-schema.sql`** - Creates the `chat_history` table with:
  - Message storage (user + assistant)
  - Session tracking
  - Timestamp ordering
  - Indexes for performance
  - Optional topic field for future analytics

## 🔄 How It Works

### Request Flow (User sends message)

```
User types message
    ↓
ChatInterface.jsx
    ↓
POST /api/chat
    ↓
server.js
    ├─→ Save user message to Supabase
    ├─→ Fetch conversation history
    ├─→ Send to Claude API with context
    ├─→ Receive Claude response
    └─→ Save Claude response to Supabase
    ↓
Response sent back to frontend
    ↓
ChatInterface.jsx displays message
```

### Routing (URL navigation)

```
User visits http://localhost:5173/
    ↓
main.jsx checks pathname
    ├─→ / → Shows App.jsx (Dashboard)
    └─→ /chat → Shows ChatApp.jsx (Claude Chat)
```

## 📜 NPM Scripts

```bash
npm run dev      # Start Vite dev server (frontend)
npm run server   # Start Express backend (API)
npm run build    # Build for production
npm run preview  # Preview production build
```

## 🗄️ Database Schema

### chat_history table

| Column      | Type      | Description                     |
|-------------|-----------|---------------------------------|
| id          | UUID      | Primary key (auto-generated)    |
| session_id  | TEXT      | Groups messages by conversation |
| role        | TEXT      | 'user' or 'assistant'           |
| content     | TEXT      | The actual message              |
| topic       | TEXT      | Optional topic tag              |
| created_at  | TIMESTAMP | When message was sent           |

**Indexes:**
- `session_id` - Fast lookup by session
- `created_at DESC` - Chronological ordering
- Composite `(session_id, created_at)` - Optimal history queries

## 🎨 Design System

**Colors:**
- Primary gradient: `#667eea` → `#764ba2`
- Text: `#1f2937` (dark gray)
- Background: White with transparency
- User messages: Gradient background
- Assistant messages: White with border

**Responsive Breakpoints:**
- Desktop: > 768px
- Tablet: 481px - 768px
- Mobile: ≤ 480px

## 🔐 Security Notes

- **`.env.local`** is in `.gitignore` - your secrets stay private
- **Backend only** calls Claude API - key never exposed to browser
- **Supabase anon key** is safe for client-side use
- **RLS policies** in Supabase allow all operations (customize for production)

## 🚀 Development Workflow

1. **First time setup:**
   - Create Supabase project
   - Run SQL schema
   - Create `.env.local` with API keys
   - `npm install`

2. **Daily development:**
   - Terminal 1: `npm run server`
   - Terminal 2: `npm run dev`
   - Code, test, repeat

3. **Testing:**
   - Dashboard: http://localhost:5173/
   - Chat: http://localhost:5173/chat

## 📦 Dependencies

**Frontend:**
- `react` - UI library
- `react-dom` - React renderer
- `@supabase/supabase-js` - Supabase client
- `vite` - Build tool & dev server

**Backend:**
- `express` - Web server framework
- `@anthropic-ai/sdk` - Claude API client
- `cors` - Enable cross-origin requests
- `dotenv` - Load environment variables

---

**Quick Links:**
- [Quick Start](QUICK_START.md) - 5-minute setup
- [Full Documentation](CLAUDE_CHAT_SETUP.md) - Complete guide
- [Supabase Schema](supabase-schema.sql) - Database setup

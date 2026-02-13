# System Architecture Diagram

## 🔄 Complete Request Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                           USER (Browser)                             │
│                                                                      │
│  Types message: "What is the meaning of life?"                      │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               │ User clicks "Send"
                               ↓
┌─────────────────────────────────────────────────────────────────────┐
│                    React Frontend (Port 5173)                        │
│                    ChatInterface.jsx Component                       │
│                                                                      │
│  1. Display user message immediately                                │
│  2. Show loading indicator                                          │
│  3. Make HTTP POST request                                          │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               │ POST /api/chat
                               │ { message: "...", sessionId: "..." }
                               ↓
┌─────────────────────────────────────────────────────────────────────┐
│                   Express Backend (Port 3001)                        │
│                        server/server.js                              │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ Step 1: Receive Request                                        │ │
│  │ - Extract message and sessionId                                │ │
│  │ - Validate inputs                                              │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                               ↓                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ Step 2: Save User Message to Database                         │ │
│  │ INSERT INTO chat_history:                                      │ │
│  │   - session_id: "session_123"                                  │ │
│  │   - role: "user"                                               │ │
│  │   - content: "What is the meaning of life?"                    │ │
│  │   - created_at: now()                                          │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                               ↓                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ Step 3: Fetch Conversation History                            │ │
│  │ SELECT * FROM chat_history                                     │ │
│  │ WHERE session_id = "session_123"                               │ │
│  │ ORDER BY created_at ASC                                        │ │
│  │                                                                │ │
│  │ Returns: [                                                     │ │
│  │   { role: "user", content: "Hello" },                          │ │
│  │   { role: "assistant", content: "Hi!" },                       │ │
│  │   { role: "user", content: "What is the meaning of life?" }    │ │
│  │ ]                                                              │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                               ↓                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ Step 4: Call Claude API                                        │ │
│  │ POST https://api.anthropic.com/v1/messages                     │ │
│  │ {                                                              │ │
│  │   model: "claude-3-5-sonnet-20241022",                         │ │
│  │   max_tokens: 4096,                                            │ │
│  │   messages: [conversation history]                             │ │
│  │ }                                                              │ │
│  └────────────────────────────────────────────────────────────────┘ │
└───────────────────────────────┬──────────────────────────────────────┘
                                │
                                │ API Request with Auth Header
                                ↓
┌─────────────────────────────────────────────────────────────────────┐
│                   Anthropic Claude API                               │
│                                                                      │
│  - Processes conversation history                                   │
│  - Generates intelligent response                                   │
│  - Returns: "The meaning of life is a profound question..."         │
└───────────────────────────────┬──────────────────────────────────────┘
                                │
                                │ Response JSON
                                ↓
┌─────────────────────────────────────────────────────────────────────┐
│                   Express Backend (Port 3001)                        │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ Step 5: Save Claude Response                                   │ │
│  │ INSERT INTO chat_history:                                      │ │
│  │   - session_id: "session_123"                                  │ │
│  │   - role: "assistant"                                          │ │
│  │   - content: "The meaning of life is..."                       │ │
│  │   - created_at: now()                                          │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                               ↓                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ Step 6: Return Response to Frontend                            │ │
│  │ { message: "The meaning of life is...", sessionId: "..." }     │ │
│  └────────────────────────────────────────────────────────────────┘ │
└───────────────────────────────┬──────────────────────────────────────┘
                                │
                                │ HTTP Response
                                ↓
┌─────────────────────────────────────────────────────────────────────┐
│                    React Frontend (Port 5173)                        │
│                                                                      │
│  1. Receive response                                                │
│  2. Hide loading indicator                                          │
│  3. Display Claude's message in chat                                │
│  4. Auto-scroll to latest message                                   │
└───────────────────────────────┬──────────────────────────────────────┘
                                │
                                ↓
┌─────────────────────────────────────────────────────────────────────┐
│                           USER (Browser)                             │
│                                                                      │
│  Sees: "The meaning of life is a profound question..."              │
└─────────────────────────────────────────────────────────────────────┘
```

## 🗄️ Database Storage

```
Supabase PostgreSQL Database
┌────────────────────────────────────────────────────────────────┐
│                     chat_history Table                          │
├────────────┬──────────────┬──────────┬───────────────┬─────────┤
│ id (UUID)  │ session_id   │ role     │ content       │ topic   │
├────────────┼──────────────┼──────────┼───────────────┼─────────┤
│ uuid-001   │ session_123  │ user     │ Hello         │ NULL    │
│ uuid-002   │ session_123  │ assistant│ Hi there!     │ NULL    │
│ uuid-003   │ session_123  │ user     │ What is...    │ NULL    │
│ uuid-004   │ session_123  │ assistant│ The meaning...│ NULL    │
└────────────┴──────────────┴──────────┴───────────────┴─────────┘
                                ↑
                                │
                  ┌─────────────┴─────────────┐
                  │   Indexes for Speed       │
                  ├───────────────────────────┤
                  │ - session_id              │
                  │ - created_at DESC         │
                  │ - (session_id, created_at)│
                  └───────────────────────────┘
```

## 🏗️ Component Architecture

```
src/
│
├── main.jsx (Router)
│   │
│   ├─→ path = "/" ────────────────┐
│   │                              ↓
│   │                        ┌──────────────┐
│   │                        │   App.jsx    │
│   │                        │  Dashboard   │
│   │                        └──────────────┘
│   │
│   └─→ path = "/chat" ─────────┐
│                                ↓
│                        ┌──────────────────┐
│                        │  ChatApp.jsx     │
│                        │  (Wrapper)       │
│                        └────────┬─────────┘
│                                 │
│                                 ↓
│                        ┌──────────────────┐
│                        │ ChatInterface    │
│                        │    .jsx + .css   │
│                        └──────────────────┘
│
└── components/
    ├── AppNav.jsx (Navigation between apps)
    ├── ChatInterface.jsx (Main chat component)
    └── ChatInterface.css (Styling)
```

## 🔐 Security Flow

```
┌──────────────────────────────────────────────────────────────┐
│                    Environment Variables                      │
│                       (.env.local)                           │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ ANTHROPIC_API_KEY=sk-ant-...  ← Never exposed to       │  │
│  │ VITE_SUPABASE_URL=https://... ← browser                │  │
│  │ VITE_SUPABASE_ANON_KEY=eyJ... ← Safe for client        │  │
│  └────────────────────────────────────────────────────────┘  │
└───────────────┬──────────────────────────────────────────────┘
                │
                ├─→ Backend Only ────┐
                │                    ↓
                │          ┌──────────────────┐
                │          │ Claude API calls │
                │          │ use secret key   │
                │          └──────────────────┘
                │
                └─→ Frontend Safe ──┐
                                    ↓
                          ┌──────────────────┐
                          │ Supabase client  │
                          │ uses public key  │
                          └──────────────────┘
```

## 📊 Data Flow Timeline

```
Time →
0ms:    User types message and clicks Send
        │
        ↓
1ms:    Frontend shows message in UI (optimistic update)
        Frontend shows "typing..." indicator
        │
        ↓
5ms:    HTTP POST request sent to backend
        │
        ↓
50ms:   Backend receives request
        Backend saves user message to Supabase
        │
        ↓
100ms:  Backend fetches conversation history
        Backend formats messages for Claude
        │
        ↓
150ms:  Backend sends request to Claude API
        │
        ↓
2000ms: Claude processes and generates response
        │
        ↓
2100ms: Backend receives Claude's response
        Backend saves response to Supabase
        │
        ↓
2150ms: Backend sends response to frontend
        │
        ↓
2200ms: Frontend receives response
        Frontend hides "typing..." indicator
        Frontend displays Claude's message
        Frontend auto-scrolls to bottom
```

## 🌐 Network Architecture

```
                     Internet
                        │
        ┌───────────────┼───────────────┐
        │               │               │
        ↓               ↓               ↓
   localhost:5173  localhost:3001   External APIs
        │               │               │
   ┌────────┐      ┌─────────┐    ┌─────────┐
   │ Vite   │      │ Express │    │ Claude  │
   │ Dev    │◄────►│ Backend │───►│ API     │
   │ Server │      │         │    │         │
   └────────┘      └─────┬───┘    └─────────┘
                         │
                         ↓
                    ┌─────────┐
                    │Supabase │
                    │Database │
                    └─────────┘
```

## 🔄 Session Management

```
Browser LocalStorage
┌──────────────────────────────────┐
│ Key: "chat_session_id"           │
│ Value: "session_1707584932_a8f2" │
└──────────────────────────────────┘
         │
         │ Sent with every message
         ↓
┌──────────────────────────────────┐
│ Backend groups all messages by   │
│ this session_id                  │
└──────────────────────────────────┘
         │
         ↓
┌──────────────────────────────────┐
│ Database stores all session      │
│ messages together                │
└──────────────────────────────────┘
         │
         │ On page reload
         ↓
┌──────────────────────────────────┐
│ Frontend fetches history and     │
│ displays previous conversation   │
└──────────────────────────────────┘
```

---

**Legend:**
- `┌─┐` Boxes = Components/Systems
- `│` = Data flow direction
- `↓` = Process step
- `◄─►` = Two-way communication
- `───►` = One-way communication

# 🤖 Claude Chat System

A complete chat interface powered by Anthropic's Claude API with persistent conversation storage in Supabase.

## 🎯 What This Is

A production-ready chat system that lets you:
- Have intelligent conversations with Claude
- Maintain conversation context across sessions
- Store all messages for future analysis
- Switch seamlessly between your dashboard and chat

## ⚡ Quick Start

### Prerequisites
- Node.js installed
- Anthropic API account ([Get one here](https://console.anthropic.com/))
- Supabase account ([Get one here](https://supabase.com/))

### Setup (5 minutes)

1. **Database Setup:**
   - Create a Supabase project
   - Run the SQL from `supabase-schema.sql` in Supabase SQL Editor

2. **Get API Keys:**
   - Anthropic: Create an API key at console.anthropic.com
   - Supabase: Get URL and anon key from Project Settings → API

3. **Configure Environment:**
   Create `.env.local` file:
   ```env
   ANTHROPIC_API_KEY=your-anthropic-key
   VITE_SUPABASE_URL=your-supabase-url
   VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
   ```

4. **Start the App:**

   **Option A - Windows (Easy):**
   ```bash
   start-dev.bat
   ```

   **Option B - Manual:**
   ```bash
   # Terminal 1
   npm run server

   # Terminal 2
   npm run dev
   ```

5. **Open Browser:**
   ```
   http://localhost:5173/chat
   ```

## 📚 Documentation

- **[QUICK_START.md](QUICK_START.md)** - 5-minute setup guide
- **[CLAUDE_CHAT_SETUP.md](CLAUDE_CHAT_SETUP.md)** - Complete documentation
- **[PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md)** - Architecture & file tree
- **[IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md)** - What was built

## 🏗️ Architecture

```
React Frontend (Vite)
        ↓
Express Backend (Node.js)
    ↓           ↓
Claude API   Supabase
```

## 📂 Key Files

```
server/server.js                 # Backend API
src/components/ChatInterface.jsx # Chat UI
src/ChatApp.jsx                  # Chat app wrapper
supabase-schema.sql              # Database schema
.env.local                       # Your API keys (create this!)
```

## 🌟 Features

- ✅ Real-time chat with Claude
- ✅ Conversation persistence
- ✅ Session management
- ✅ Message history
- ✅ Clean, responsive UI
- ✅ Context-aware responses
- ✅ Future analytics ready

## 🎨 Navigation

- **Dashboard**: `http://localhost:5173/`
- **Claude Chat**: `http://localhost:5173/chat`

Use the nav buttons in the top-right corner to switch.

## 🔧 NPM Scripts

```bash
npm run dev      # Start frontend dev server
npm run server   # Start backend API server
npm run build    # Build for production
```

## 🐛 Troubleshooting

**Backend won't start:**
- Check `.env.local` exists with all 3 variables

**Can't send messages:**
- Verify backend is running (Terminal 1)
- Check console for errors

**Supabase errors:**
- Run `supabase-schema.sql` in Supabase SQL Editor
- Verify Supabase URL and key in `.env.local`

**Claude API errors:**
- Verify API key starts with `sk-ant-`
- Check you have credits in Anthropic account

## 🔮 Future Capabilities

The data structure supports:
- Topic clustering and categorization
- Behavioral pattern analysis
- Productivity insights
- Smart task suggestions
- Sentiment analysis
- Usage statistics

## 📝 Tech Stack

- **Frontend**: React 19, Vite 8
- **Backend**: Express.js, Node.js
- **AI**: Anthropic Claude 3.5 Sonnet
- **Database**: Supabase (PostgreSQL)
- **Styling**: Modern CSS with gradients

## 🔒 Security

- API keys stored in `.env.local` (never committed)
- Backend-only Claude API calls
- Supabase RLS policies enabled
- CORS configured
- Input validation

## 🚀 Production Deployment

Before deploying:
1. Add user authentication
2. Implement rate limiting
3. Set up proper RLS policies
4. Add monitoring and logging
5. Use production-grade hosting

## 📄 License

This is a custom implementation for your project.

## 🤝 Support

For setup help, see the troubleshooting section in [CLAUDE_CHAT_SETUP.md](CLAUDE_CHAT_SETUP.md).

---

**Ready to chat with Claude?** → `npm run server` + `npm run dev` → Open `http://localhost:5173/chat`

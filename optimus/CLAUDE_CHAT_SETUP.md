# Claude Chat System - Setup Guide

A complete chat system powered by Anthropic's Claude API with persistent conversation storage in Supabase.

## 🎯 Features

- **Real-time Chat Interface**: Clean, responsive UI for chatting with Claude
- **Persistent Storage**: All conversations saved to Supabase for future analysis
- **Session Management**: Maintains conversation context across sessions
- **Message History**: Load and continue previous conversations
- **Smart Context**: Claude receives full conversation history for coherent responses
- **Future-Ready**: Data structured for topic clustering, pattern analysis, and insights

## 📋 Prerequisites

Before you begin, ensure you have:

- Node.js (v16 or higher)
- npm or yarn package manager
- Anthropic API account
- Supabase account

## 🚀 Quick Start

### 1. Database Setup (Supabase)

1. **Create a Supabase Project**
   - Go to [https://supabase.com/](https://supabase.com/)
   - Click "New Project"
   - Fill in project details and wait for setup to complete

2. **Run the SQL Schema**
   - Open your Supabase project dashboard
   - Go to "SQL Editor"
   - Copy the contents of `supabase-schema.sql`
   - Paste and run the SQL to create the `chat_history` table

3. **Get API Credentials**
   - Go to Project Settings > API
   - Copy the "Project URL"
   - Copy the "anon/public" key

### 2. Get Anthropic API Key

1. Go to [https://console.anthropic.com/](https://console.anthropic.com/)
2. Sign in or create an account
3. Navigate to "API Keys"
4. Click "Create Key"
5. Copy your API key (you won't be able to see it again!)

### 3. Environment Variables Setup

1. Copy the example environment file:
   ```bash
   cp .env.example .env.local
   ```

2. Open `.env.local` and fill in your credentials:
   ```env
   ANTHROPIC_API_KEY=sk-ant-api03-... # Your Anthropic API key
   VITE_SUPABASE_URL=https://xxxxx.supabase.co # Your Supabase URL
   VITE_SUPABASE_ANON_KEY=eyJhbGc... # Your Supabase anon key
   PORT=3001 # Backend server port (optional)
   ```

### 4. Install Dependencies

```bash
npm install
```

This will install all required packages:
- `@anthropic-ai/sdk` - Claude API client
- `@supabase/supabase-js` - Supabase client
- `express` - Backend server
- `cors` - Cross-origin resource sharing
- `dotenv` - Environment variable management

### 5. Start the Application

You'll need to run both the backend server and the frontend development server.

**Terminal 1 - Backend Server:**
```bash
node server/server.js
```

You should see:
```
🚀 Claude Chat API server running on port 3001
📍 Health check: http://localhost:3001/api/health
```

**Terminal 2 - Frontend Development Server:**
```bash
npm run dev
```

You should see:
```
  VITE v8.0.0  ready in XXX ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```

### 6. Test the Application

1. Open your browser to `http://localhost:5173/`
2. You should see the Claude Chat interface
3. Type a message and press Enter
4. Claude should respond within a few seconds

## 📁 Project Structure

```
optimus/
├── server/
│   └── server.js              # Express backend with Claude API integration
├── src/
│   ├── components/
│   │   ├── ChatInterface.jsx  # React chat component
│   │   └── ChatInterface.css  # Chat styling
│   ├── supabaseClient.js      # Supabase configuration (existing)
│   └── main.jsx               # React entry point
├── supabase-schema.sql        # Database schema for chat_history table
├── .env.example               # Environment variables template
├── .env.local                 # Your actual environment variables (not in git)
└── package.json               # Project dependencies
```

## 🔧 API Endpoints

### Backend Server (Port 3001)

**Health Check**
```
GET /api/health
```
Returns server status

**Send Chat Message**
```
POST /api/chat
Body: { message: string, sessionId: string }
```
- Saves user message to database
- Fetches conversation history
- Sends to Claude API with context
- Saves and returns Claude's response

**Get Conversation History**
```
GET /api/chat/history/:sessionId
```
Returns all messages for a specific session

**Clear Conversation History**
```
DELETE /api/chat/history/:sessionId
```
Deletes all messages for a specific session

## 💾 Database Schema

The `chat_history` table structure:

| Column      | Type      | Description                          |
|-------------|-----------|--------------------------------------|
| id          | UUID      | Primary key                          |
| session_id  | TEXT      | Groups messages by conversation      |
| role        | TEXT      | 'user' or 'assistant'                |
| content     | TEXT      | Message content                      |
| topic       | TEXT      | For future topic categorization      |
| created_at  | TIMESTAMP | Message timestamp                    |

**Indexes:**
- `session_id` - Fast session queries
- `created_at DESC` - Chronological ordering
- Composite index on both for optimal performance

## 🎨 Customization

### Change Claude Model

Edit `server/server.js` line 80:
```javascript
model: 'claude-3-5-sonnet-20241022', // Change to another model
```

Available models:
- `claude-3-5-sonnet-20241022` - Best balance of speed and quality
- `claude-3-opus-20240229` - Highest quality, slower
- `claude-3-haiku-20240307` - Fastest, more economical

### Adjust Response Length

Edit `server/server.js` line 81:
```javascript
max_tokens: 4096, // Increase for longer responses
```

### Styling

Edit `src/components/ChatInterface.css` to customize:
- Colors and gradients
- Message bubble styles
- Typography
- Responsive breakpoints

## 🔮 Future Analytics Features

The data structure supports:

1. **Topic Clustering**: Group conversations by subject
2. **Behavioral Patterns**: Analyze user interaction patterns
3. **Productivity Insights**: Track conversation efficiency
4. **Smart Suggestions**: AI-powered task recommendations
5. **Sentiment Analysis**: Understand conversation tone
6. **Usage Statistics**: Time-based analytics and trends

To implement these, you can query the `chat_history` table and use:
- The `topic` field for categorization
- The `session_id` for user session analysis
- The `created_at` for temporal patterns
- The `content` for NLP analysis

## 🐛 Troubleshooting

### Backend server won't start

**Error: Missing environment variables**
- Make sure `.env.local` exists and has all required values
- Check that ANTHROPIC_API_KEY is valid

**Error: Port 3001 already in use**
- Change PORT in `.env.local` to another port (e.g., 3002)
- Update API_URL in `ChatInterface.jsx` to match

### Frontend can't connect to backend

**Error: Network request failed**
- Ensure backend server is running on port 3001
- Check that CORS is enabled (already configured)
- Verify API_URL in `ChatInterface.jsx` matches backend port

### Supabase errors

**Error: relation "chat_history" does not exist**
- Run the SQL schema from `supabase-schema.sql` in Supabase SQL editor

**Error: Authentication failed**
- Double-check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
- Ensure Row Level Security policies are set correctly

### Claude API errors

**Error: Invalid API key**
- Verify ANTHROPIC_API_KEY is correct
- Make sure there are no extra spaces or quotes

**Error: Rate limit exceeded**
- You've hit API rate limits
- Wait a few minutes or upgrade your Anthropic plan

## 📝 Development Tips

1. **Session Management**: Sessions are stored in localStorage. Clear browser data to start a fresh session.

2. **Message Persistence**: All messages are immediately saved to Supabase, so you can refresh the page without losing history.

3. **Context Limit**: Claude has a context window limit. Very long conversations might need truncation logic.

4. **Production Deployment**:
   - Use a production server (not `node server.js`)
   - Add authentication/authorization
   - Implement rate limiting
   - Add error logging and monitoring

## 🔒 Security Notes

- Never commit `.env.local` to version control
- The Supabase anon key is safe for client-side use
- Anthropic API key should only be used server-side
- Implement user authentication before production deployment
- Add rate limiting to prevent API abuse

## 📚 Resources

- [Anthropic API Documentation](https://docs.anthropic.com/)
- [Supabase Documentation](https://supabase.com/docs)
- [React Documentation](https://react.dev/)
- [Express.js Guide](https://expressjs.com/)

## 🤝 Support

If you encounter issues:
1. Check the troubleshooting section above
2. Review browser console for errors
3. Check backend server logs
4. Verify all environment variables are set correctly

---

Built with ❤️ using Claude, React, and Supabase

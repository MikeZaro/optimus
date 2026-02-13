# 📋 Setup Checklist

Follow these steps to get your Claude Chat system running.

## ✅ Step-by-Step Setup

### 1. Database Setup (Supabase)

- [ ] Go to [https://supabase.com/](https://supabase.com/)
- [ ] Click "New Project"
- [ ] Enter project name and password
- [ ] Wait for project to be created (~2 minutes)
- [ ] Once ready, go to "SQL Editor" (left sidebar)
- [ ] Open `supabase-schema.sql` from this project
- [ ] Copy all the SQL code
- [ ] Paste into Supabase SQL Editor
- [ ] Click "Run" button
- [ ] Verify success message appears

**Get Supabase Credentials:**
- [ ] Go to Project Settings (gear icon) → API
- [ ] Copy "Project URL" (looks like: `https://xxxxx.supabase.co`)
- [ ] Copy "anon public" key (long string starting with `eyJ...`)

### 2. Get Anthropic API Key

- [ ] Go to [https://console.anthropic.com/](https://console.anthropic.com/)
- [ ] Sign in or create an account
- [ ] Click "API Keys" in the left sidebar
- [ ] Click "Create Key" button
- [ ] Name your key (e.g., "Claude Chat")
- [ ] Copy the API key (starts with `sk-ant-`)
- [ ] **Important**: Save it now - you won't see it again!

### 3. Configure Environment Variables

- [ ] Open `.env.local` file in your project root
- [ ] Replace `your_anthropic_api_key_here` with your actual Anthropic API key
- [ ] Replace `your_supabase_project_url_here` with your Supabase URL
- [ ] Replace `your_supabase_anon_key_here` with your Supabase anon key
- [ ] Save the file

**Your `.env.local` should look like:**
```env
ANTHROPIC_API_KEY=sk-ant-api03-xxxxx
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJxxxxx
PORT=3001
```

### 4. Verify Dependencies

- [ ] Open terminal in project folder
- [ ] Run: `npm install`
- [ ] Wait for installation to complete
- [ ] Check for any errors

### 5. Start the Application

**Option A - Windows Quick Start:**
- [ ] Double-click `start-dev.bat`
- [ ] Two command windows should open
- [ ] Wait for both servers to start

**Option B - Manual Start:**
- [ ] Open first terminal
- [ ] Run: `npm run server`
- [ ] See: `🚀 Claude Chat API server running on port 3001`
- [ ] Open second terminal
- [ ] Run: `npm run dev`
- [ ] See: `➜  Local:   http://localhost:5173/`

### 6. Test the Chat

- [ ] Open browser to `http://localhost:5173/chat`
- [ ] See the chat interface
- [ ] Type a test message: "Hello Claude!"
- [ ] Press Enter or click Send
- [ ] Wait 2-5 seconds
- [ ] See Claude's response appear

### 7. Verify Database Storage

- [ ] Go back to Supabase dashboard
- [ ] Click "Table Editor" in left sidebar
- [ ] Select `chat_history` table
- [ ] See your messages stored there
- [ ] Verify both user and assistant messages appear

### 8. Test Navigation

- [ ] Click "Dashboard" button (top-right)
- [ ] See your productivity dashboard
- [ ] Click "Claude Chat" button
- [ ] Return to chat interface
- [ ] Verify conversation is still there

## 🎉 Success Criteria

You're all set if you can:
- ✅ Send a message to Claude
- ✅ Receive a response
- ✅ See messages in Supabase database
- ✅ Reload page and see conversation history
- ✅ Switch between Dashboard and Chat

## ❌ Common Issues

### Issue: "Cannot read environment variables"
**Fix:**
- Check `.env.local` exists in project root
- Verify no typos in variable names
- Restart the server after editing `.env.local`

### Issue: "Network Error" in chat
**Fix:**
- Make sure backend server is running (Terminal 1)
- Check it says "running on port 3001"
- Verify no firewall blocking port 3001

### Issue: "Invalid API Key" error
**Fix:**
- Double-check Anthropic API key in `.env.local`
- Make sure it starts with `sk-ant-`
- Verify no extra spaces or quotes
- Create a new API key if needed

### Issue: Supabase "table does not exist"
**Fix:**
- Go to Supabase SQL Editor
- Run the `supabase-schema.sql` again
- Check for any error messages
- Verify table appears in Table Editor

### Issue: Messages not persisting
**Fix:**
- Check Supabase URL and key in `.env.local`
- Look at browser console for errors
- Verify RLS policies are set in Supabase

## 🔍 Verification Commands

Run these to verify setup:

```bash
# Check if dependencies are installed
npm list @anthropic-ai/sdk @supabase/supabase-js express

# Check if .env.local exists
type .env.local

# Test backend server
# (After starting server)
curl http://localhost:3001/api/health
```

## 📝 Next Steps After Setup

Once everything is working:

1. **Customize the UI:**
   - Edit `src/components/ChatInterface.css` for styling
   - Modify colors, fonts, layout

2. **Adjust Claude Settings:**
   - Edit `server/server.js` line 80 to change model
   - Adjust `max_tokens` for longer/shorter responses

3. **Add Features:**
   - User authentication
   - Multiple conversation threads
   - Export conversations
   - Search functionality

4. **Set Up Analytics:**
   - Use the `topic` field for categorization
   - Build dashboards to visualize conversations
   - Analyze usage patterns

## 📚 Documentation

Stuck? Check these guides:

- **Quick Setup**: `QUICK_START.md`
- **Full Documentation**: `CLAUDE_CHAT_SETUP.md`
- **Architecture**: `PROJECT_STRUCTURE.md`
- **What Was Built**: `IMPLEMENTATION_SUMMARY.md`

## 🆘 Still Having Issues?

1. Check browser console (F12) for errors
2. Check backend server terminal for errors
3. Review the troubleshooting section in `CLAUDE_CHAT_SETUP.md`
4. Verify all checklist items above are completed

---

**Ready to start?** Begin with Step 1: Database Setup!

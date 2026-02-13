# Quick Start Guide - Claude Chat System

## 🚀 Get Started in 5 Minutes

### Step 1: Set Up Supabase Database

1. Go to [https://supabase.com/](https://supabase.com/) and create a new project
2. Once created, go to the SQL Editor in your Supabase dashboard
3. Copy the entire contents of `supabase-schema.sql` and paste it into the SQL Editor
4. Click "Run" to create the `chat_history` table

### Step 2: Get Your API Keys

**Supabase:**
1. In your Supabase project, go to **Settings** → **API**
2. Copy the **Project URL**
3. Copy the **anon/public key**

**Anthropic:**
1. Go to [https://console.anthropic.com/](https://console.anthropic.com/)
2. Sign in or create an account
3. Go to **API Keys** → **Create Key**
4. Copy the API key (starts with `sk-ant-`)

### Step 3: Configure Environment Variables

1. Open the file `.env.local` in your project root (create it if it doesn't exist)
2. Add these three lines with your actual values:

```env
ANTHROPIC_API_KEY=sk-ant-api03-your-key-here
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

### Step 4: Start the Application

Open **two terminal windows** in your project directory:

**Terminal 1 - Start Backend Server:**
```bash
npm run server
```

You should see:
```
🚀 Claude Chat API server running on port 3001
```

**Terminal 2 - Start Frontend:**
```bash
npm run dev
```

You should see:
```
➜  Local:   http://localhost:5173/
```

### Step 5: Open the Chat

1. Open your browser to: **http://localhost:5173/chat**
2. Type a message and press Enter
3. Claude will respond!

## 📱 Navigation

- **Dashboard**: http://localhost:5173/
- **Claude Chat**: http://localhost:5173/chat

Use the navigation buttons in the top-right corner to switch between apps.

## ❓ Troubleshooting

### "Cannot connect to backend"
- Make sure Terminal 1 (backend server) is running
- Check that it says "running on port 3001"

### "Supabase error"
- Verify you ran the SQL schema in Supabase
- Check that your `.env.local` has the correct Supabase URL and key

### "Anthropic API error"
- Verify your API key starts with `sk-ant-`
- Make sure you have credits in your Anthropic account

## 📚 Full Documentation

For detailed setup, customization, and troubleshooting, see:
- **CLAUDE_CHAT_SETUP.md** - Complete documentation
- **supabase-schema.sql** - Database schema with comments
- **.env.example** - Environment variable template

---

**Need help?** Check the troubleshooting section in CLAUDE_CHAT_SETUP.md

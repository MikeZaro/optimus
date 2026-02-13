# 🔧 Troubleshooting Guide

Common issues and how to fix them.

## 🚨 Backend Server Issues

### Issue: "Cannot find module '@anthropic-ai/sdk'"

**Symptoms:**
```
Error: Cannot find module '@anthropic-ai/sdk'
```

**Solution:**
```bash
npm install
```

**Why it happens:** Dependencies weren't installed

---

### Issue: "ANTHROPIC_API_KEY is not defined"

**Symptoms:**
```
Error: Missing API key
```

**Solution:**
1. Check `.env.local` exists in project root
2. Verify it contains: `ANTHROPIC_API_KEY=sk-ant-...`
3. Restart the backend server: `npm run server`

**Why it happens:** Environment variables not loaded

---

### Issue: Backend server won't start - Port already in use

**Symptoms:**
```
Error: listen EADDRINUSE: address already in use :::3001
```

**Solution Option 1 - Change Port:**
1. Edit `.env.local`
2. Change `PORT=3001` to `PORT=3002`
3. Update `ChatInterface.jsx` line 20: `const API_URL = 'http://localhost:3002/api'`
4. Restart server

**Solution Option 2 - Kill Process:**
```bash
# Windows
netstat -ano | findstr :3001
taskkill /PID <PID> /F

# Mac/Linux
lsof -ti:3001 | xargs kill
```

**Why it happens:** Another process using port 3001

---

## 🌐 Frontend Issues

### Issue: "Failed to fetch" or "Network Error"

**Symptoms:**
- Chat shows error message
- Browser console: `Failed to fetch` or `ERR_CONNECTION_REFUSED`

**Solution:**
1. Verify backend is running (check Terminal 1)
2. Should see: `🚀 Claude Chat API server running on port 3001`
3. If not running: `npm run server`
4. Check `API_URL` in `ChatInterface.jsx` matches backend port

**Why it happens:** Backend server not running

---

### Issue: Page shows blank screen

**Symptoms:**
- White/blank page
- Browser console shows errors

**Solution:**
1. Check browser console (F12)
2. Look for error messages
3. Common fix: Clear browser cache and reload
4. Verify frontend server is running: `npm run dev`

**Why it happens:** Build error or caching issue

---

### Issue: Navigation doesn't work

**Symptoms:**
- Clicking nav buttons doesn't switch apps
- URL changes but page doesn't update

**Solution:**
1. Hard refresh: `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac)
2. Clear browser cache
3. Restart dev server: `npm run dev`

**Why it happens:** Vite hot reload issue

---

## 🗄️ Database Issues

### Issue: "relation 'chat_history' does not exist"

**Symptoms:**
```
Error: relation "chat_history" does not exist
```

**Solution:**
1. Go to Supabase dashboard
2. Open SQL Editor
3. Copy all content from `supabase-schema.sql`
4. Paste and click "Run"
5. Verify: Go to Table Editor → should see `chat_history`

**Why it happens:** Database table not created

---

### Issue: "Authentication failed" - Supabase error

**Symptoms:**
```
Error: Invalid API key
Auth session missing
```

**Solution:**
1. Check `.env.local` has correct Supabase credentials
2. Verify `VITE_SUPABASE_URL` format: `https://xxxxx.supabase.co`
3. Verify `VITE_SUPABASE_ANON_KEY` starts with `eyJ`
4. Restart both servers

**To get correct values:**
1. Supabase Dashboard → Settings → API
2. Copy "Project URL"
3. Copy "anon public" key (NOT service_role key)

**Why it happens:** Wrong credentials in .env.local

---

### Issue: Messages not saving to database

**Symptoms:**
- Messages display in chat but disappear on refresh
- Supabase table is empty

**Solution:**
1. Check Supabase credentials in `.env.local`
2. Check browser console for errors
3. Verify RLS policies: Supabase → Authentication → Policies
4. Ensure policy allows INSERT on `chat_history`

**Quick fix:**
Run this SQL in Supabase to allow all operations:
```sql
ALTER TABLE chat_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations"
ON chat_history
FOR ALL
USING (true)
WITH CHECK (true);
```

**Why it happens:** Row Level Security blocking inserts

---

## 🤖 Claude API Issues

### Issue: "Invalid API key" error

**Symptoms:**
```
Error: Invalid API key
```

**Solution:**
1. Verify API key in `.env.local` starts with `sk-ant-`
2. No quotes around the key
3. No extra spaces
4. Create new key if needed: console.anthropic.com

**Why it happens:** Invalid or expired API key

---

### Issue: "Rate limit exceeded"

**Symptoms:**
```
Error: 429 Too Many Requests
Rate limit exceeded
```

**Solution:**
1. Wait 60 seconds and try again
2. Check Anthropic console for rate limits
3. Upgrade Anthropic plan if needed

**Why it happens:** Too many requests too quickly

---

### Issue: "Insufficient credits"

**Symptoms:**
```
Error: Insufficient credits
```

**Solution:**
1. Go to console.anthropic.com
2. Check billing section
3. Add credits or payment method

**Why it happens:** No credits in Anthropic account

---

### Issue: Claude responses are very slow

**Symptoms:**
- Takes 10+ seconds to get response
- Timeout errors

**Solution:**
1. Check internet connection
2. Reduce `max_tokens` in `server/server.js` (line 81)
3. Switch to faster model: `claude-3-haiku-20240307`

**To change model:**
Edit `server/server.js` line 80:
```javascript
model: 'claude-3-haiku-20240307', // Faster, cheaper
```

**Why it happens:** Long context or slow connection

---

## 💻 Development Environment Issues

### Issue: "npm: command not found"

**Symptoms:**
```bash
'npm' is not recognized as an internal or external command
```

**Solution:**
1. Install Node.js from nodejs.org
2. Restart terminal
3. Verify: `node --version`

**Why it happens:** Node.js not installed

---

### Issue: "Permission denied" errors

**Symptoms:**
```
EACCES: permission denied
```

**Solution:**
```bash
# Windows - Run as Administrator
# Mac/Linux
sudo npm install
```

**Why it happens:** Insufficient permissions

---

### Issue: Changes not reflecting

**Symptoms:**
- Edit code but nothing changes in browser
- Old version still showing

**Solution:**
1. Hard refresh: `Ctrl+Shift+R`
2. Restart dev server: `npm run dev`
3. Clear browser cache
4. Check if you're editing the right file

**Why it happens:** Caching or build issue

---

## 🔍 Debugging Tips

### Enable Detailed Logging

**Backend logging:**
Add to `server/server.js`:
```javascript
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});
```

**Frontend logging:**
Add to `ChatInterface.jsx` sendMessage function:
```javascript
console.log('Sending message:', userMessage);
console.log('Session ID:', sessionId);
```

### Check Browser Console

**Open Console:**
- Chrome/Edge: F12 → Console tab
- Firefox: F12 → Console tab
- Safari: Cmd+Option+C

**Look for:**
- Red error messages
- Network failures
- CORS errors

### Check Network Tab

**Steps:**
1. F12 → Network tab
2. Send a message
3. Look for `/api/chat` request
4. Check status code (should be 200)
5. Click to see request/response details

### Verify Environment Variables

**Check they're loaded:**
Add to `server/server.js` after imports:
```javascript
console.log('API Key exists:', !!process.env.ANTHROPIC_API_KEY);
console.log('Supabase URL:', process.env.VITE_SUPABASE_URL);
```

## 🆘 Still Stuck?

### Checklist before asking for help:

- [ ] Ran `npm install`
- [ ] Created `.env.local` with all 3 keys
- [ ] Ran Supabase SQL schema
- [ ] Restarted both servers
- [ ] Checked browser console for errors
- [ ] Checked backend terminal for errors
- [ ] Verified API keys are correct
- [ ] Cleared browser cache

### Information to provide:

1. **Error message** (exact text)
2. **When it happens** (on load, on message send, etc.)
3. **Browser console errors** (screenshot)
4. **Backend terminal output** (screenshot)
5. **What you tried** (from this guide)

### Quick Reset (Nuclear Option)

If nothing works, try a complete reset:

```bash
# 1. Stop all servers (Ctrl+C in both terminals)

# 2. Clean install
rm -rf node_modules
npm install

# 3. Verify .env.local
cat .env.local

# 4. Restart servers
# Terminal 1
npm run server

# Terminal 2
npm run dev
```

---

**Most issues are solved by:**
1. ✅ Checking `.env.local` exists and has correct values
2. ✅ Running `npm install`
3. ✅ Restarting both servers
4. ✅ Checking browser console for errors

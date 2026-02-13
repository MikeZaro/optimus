# Optimus Database Setup Guide

This guide walks you through setting up the complete Supabase database schema for the Optimus AI Task Curator system.

## Overview

The Optimus system uses **7 core tables**:
1. **goals** - User goals across 3 life areas
2. **tasks** - AI-curated and user-added tasks
3. **daily_inputs** - Daily "What's important today?" responses
4. **chat_messages** - Claude conversation history
5. **bottlenecks** - Detected productivity barriers
6. **time_summaries** - Rolling time-based analysis
7. **goal_queue** - Paused goals waiting to be reactivated

## Setup Steps

### Option 1: Fresh Installation (No Existing Data)

If you're setting up Optimus for the first time:

1. **Open Supabase SQL Editor**
   - Go to your Supabase project dashboard
   - Navigate to **SQL Editor** in the left sidebar

2. **Run the Complete Schema**
   - Copy the entire contents of `supabase-schema.sql`
   - Paste into a new query in the SQL Editor
   - Click **Run**

3. **Verify Tables Created**
   ```sql
   SELECT table_name
   FROM information_schema.tables
   WHERE table_schema = 'public'
   ORDER BY table_name;
   ```

   You should see:
   - `bottlenecks`
   - `chat_messages`
   - `daily_inputs`
   - `goal_queue`
   - `goals`
   - `tasks`
   - `time_summaries`

### Option 2: Migration (Existing chat_history table)

If you already have a `chat_history` table from the previous chat system:

1. **First, Run the Main Schema**
   - Open Supabase SQL Editor
   - Copy contents of `supabase-schema.sql`
   - Paste and **Run**

   This creates all new tables (goals, tasks, etc.)

2. **Then, Run the Migration Script**
   - Open a new query in SQL Editor
   - Copy contents of `supabase-migration.sql`
   - Paste and **Run**

   This will:
   - Rename `chat_history` → `chat_messages`
   - Add `goal_id` column
   - Create necessary indexes
   - Preserve all existing chat data

3. **Verify Migration**
   ```sql
   -- Check table was renamed
   SELECT COUNT(*) as message_count FROM chat_messages;

   -- Check goal_id column exists
   SELECT column_name, data_type
   FROM information_schema.columns
   WHERE table_name = 'chat_messages';
   ```

## Verification

After setup, verify everything is working:

### 1. Check All Tables Exist
```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('goals', 'tasks', 'daily_inputs', 'chat_messages', 'bottlenecks', 'time_summaries', 'goal_queue')
ORDER BY table_name;
```

Should return 7 rows.

### 2. Verify Constraints
```sql
-- Test: Only one active goal per area
INSERT INTO goals (area, title, status) VALUES ('work', 'Test Goal 1', 'active');
INSERT INTO goals (area, title, status) VALUES ('work', 'Test Goal 2', 'active');
-- Second insert should FAIL with unique constraint error
```

Clean up test:
```sql
DELETE FROM goals WHERE title LIKE 'Test Goal%';
```

### 3. Verify Indexes
```sql
SELECT indexname
FROM pg_indexes
WHERE tablename IN ('goals', 'tasks', 'daily_inputs', 'chat_messages', 'bottlenecks', 'time_summaries', 'goal_queue')
ORDER BY tablename, indexname;
```

Should return multiple indexes for each table.

### 4. Verify RLS Policies
```sql
SELECT tablename, policyname
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename;
```

Should show "Allow all for single user" policy on each table.

## Sample Data (Optional)

To test the system with sample data:

```sql
-- Insert a test goal
INSERT INTO goals (area, title, status)
VALUES ('work', 'Close Miller real estate deal', 'active')
RETURNING *;

-- Insert sample tasks (replace <goal_id> with UUID from above)
INSERT INTO tasks (goal_id, area, content, source, presented_at)
VALUES
  ('<goal_id>', 'work', 'Call Miller to schedule property walkthrough', 'ai_curated', NOW()),
  ('<goal_id>', 'work', 'Research comparable properties in area', 'ai_curated', NOW()),
  ('<goal_id>', 'work', 'Prepare financing options presentation', 'ai_curated', NOW())
RETURNING *;

-- Insert daily input
INSERT INTO daily_inputs (input_date, response_text)
VALUES (CURRENT_DATE, 'Focus on closing the Miller deal today')
RETURNING *;
```

## Troubleshooting

### Issue: "relation already exists" errors

**Solution:** Some tables already exist. Run only the parts you need:
```sql
-- Check which tables exist
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';

-- Drop specific table if needed (WARNING: deletes all data)
DROP TABLE IF EXISTS goals CASCADE;
```

### Issue: "violates check constraint" errors

**Solution:** Check that values match allowed enums:
- `area`: Must be 'personal', 'work', or 'education'
- `status`: Must be 'active', 'paused', or 'completed'
- `source`: Must be 'ai_curated' or 'user_added'
- `role`: Must be 'user' or 'assistant'

### Issue: Migration fails on chat_history rename

**Solution:** Table might already be renamed. Check:
```sql
SELECT table_name FROM information_schema.tables
WHERE table_name IN ('chat_history', 'chat_messages');
```

If `chat_messages` exists, skip the rename step.

## Next Steps

After database setup is complete:

1. ✅ **Phase 1 Complete**: Database Foundation
2. 📋 **Next**: Phase 2 - Build Basic Goal & Task UI
   - Create `DailyInput.jsx` component
   - Create `GoalSection.jsx` component
   - Create `TaskDisplay.jsx` component
   - Integrate into App.jsx

See `IMPLEMENTATION_PLAN.md` for full roadmap.

## Schema Diagram

```
┌─────────────────┐
│     goals       │
│─────────────────│
│ id (PK)         │
│ area            │◄──┐
│ title           │   │
│ status          │   │
└─────────────────┘   │
                      │
┌─────────────────┐   │
│     tasks       │   │
│─────────────────│   │
│ id (PK)         │   │
│ goal_id (FK)    │───┘
│ area            │
│ content         │
│ source          │
│ completed_at    │
│ skipped_at      │
└─────────────────┘

┌─────────────────┐
│ chat_messages   │
│─────────────────│
│ id (PK)         │
│ session_id      │
│ role            │
│ content         │
│ goal_id (FK)    │───┐
└─────────────────┘   │
                      │
┌─────────────────┐   │
│  bottlenecks    │   │
│─────────────────│   │
│ id (PK)         │   │
│ goal_id (FK)    │───┘
│ bottleneck_type │
│ severity        │
│ description     │
└─────────────────┘

┌─────────────────┐
│ daily_inputs    │
│─────────────────│
│ id (PK)         │
│ input_date      │
│ response_text   │
└─────────────────┘

┌─────────────────┐
│ time_summaries  │
│─────────────────│
│ id (PK)         │
│ timeframe       │
│ summary_text    │
│ patterns (JSON) │
└─────────────────┘

┌─────────────────┐
│  goal_queue     │
│─────────────────│
│ id (PK)         │
│ goal_id (FK)    │───┐
│ area            │   │
│ queue_position  │   │
└─────────────────┘   │
                      │
                   (links back to goals)
```

## Support

If you encounter issues:
1. Check the troubleshooting section above
2. Verify Supabase service role key is correct in `.env.local`
3. Check Supabase project dashboard for error logs
4. Review RLS policies if queries fail

---

**Database Setup Complete!** 🎉

Proceed to Phase 2 of implementation.

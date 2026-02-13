-- ========================================
-- Optimus AI Task Curator - Complete Database Schema
-- ========================================
-- This schema supports the full Optimus system:
-- - Goal tracking across 3 life areas
-- - AI-curated task generation
-- - Bottleneck detection
-- - Pattern learning
-- - Time-based summaries
-- - Chat integration
-- ========================================

-- ========================================
-- TABLE: goals
-- ========================================
-- Stores user goals for each area (Personal Well Being, Work, Education)
-- Business Rule: Only ONE active goal per area at a time

CREATE TABLE IF NOT EXISTS goals (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID, -- Single user initially, NULL for now
    area TEXT NOT NULL CHECK (area IN ('personal', 'work', 'education')),
    title TEXT NOT NULL,
    description TEXT,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    completion_task_count INTEGER DEFAULT 0
);

-- Backfill-safe migration for existing databases
ALTER TABLE goals
ADD COLUMN IF NOT EXISTS description TEXT;

ALTER TABLE goals
ADD COLUMN IF NOT EXISTS notes TEXT;

-- Only ONE active goal per area constraint
CREATE UNIQUE INDEX IF NOT EXISTS idx_goals_active_per_area
ON goals (user_id, area)
WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_goals_area ON goals (area);
CREATE INDEX IF NOT EXISTS idx_goals_status ON goals (status);
CREATE INDEX IF NOT EXISTS idx_goals_created ON goals (created_at DESC);

-- ========================================
-- TABLE: tasks
-- ========================================
-- Stores both AI-curated and user-added tasks
-- Business Rule: Task can only be completed OR skipped (mutually exclusive)

CREATE TABLE IF NOT EXISTS tasks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID,
    goal_id UUID REFERENCES goals(id) ON DELETE SET NULL,
    area TEXT NOT NULL CHECK (area IN ('personal', 'work', 'education')),
    content TEXT NOT NULL,
    source TEXT NOT NULL CHECK (source IN ('ai_curated', 'user_added')),
    sequence_position INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    skipped_at TIMESTAMP WITH TIME ZONE,
    presented_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT tasks_completion_xor CHECK (
        (completed_at IS NULL AND skipped_at IS NULL) OR
        (completed_at IS NOT NULL AND skipped_at IS NULL) OR
        (completed_at IS NULL AND skipped_at IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_tasks_goal ON tasks (goal_id);
CREATE INDEX IF NOT EXISTS idx_tasks_area ON tasks (area);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks (completed_at, skipped_at);
CREATE INDEX IF NOT EXISTS idx_tasks_presented ON tasks (presented_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_source ON tasks (source);

-- ========================================
-- TABLE: daily_inputs
-- ========================================
-- Stores user responses to "What's important today?" prompt
-- Multiple entries per day allowed

CREATE TABLE IF NOT EXISTS daily_inputs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID,
    input_date DATE NOT NULL DEFAULT CURRENT_DATE,
    response_text TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_daily_inputs_date ON daily_inputs (input_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_inputs_user_date ON daily_inputs (user_id, input_date);
CREATE INDEX IF NOT EXISTS idx_daily_inputs_created ON daily_inputs (created_at DESC);

-- ========================================
-- TABLE: chat_messages (formerly chat_history)
-- ========================================
-- Stores all chatbot conversations with Claude
-- Links conversations to goals when relevant

CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    topic TEXT,
    goal_id UUID REFERENCES goals(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session_created ON chat_messages(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_goal ON chat_messages (goal_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_role ON chat_messages (role);

-- ========================================
-- TABLE: bottlenecks
-- ========================================
-- Stores detected productivity barriers
-- Ranked by severity to prioritize task curation

CREATE TABLE IF NOT EXISTS bottlenecks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID,
    area TEXT NOT NULL CHECK (area IN ('personal', 'work', 'education')),
    goal_id UUID REFERENCES goals(id) ON DELETE CASCADE,
    bottleneck_type TEXT NOT NULL,
    severity INTEGER NOT NULL CHECK (severity BETWEEN 1 AND 10),
    description TEXT NOT NULL,
    detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    resolved_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_bottlenecks_goal ON bottlenecks (goal_id);
CREATE INDEX IF NOT EXISTS idx_bottlenecks_severity ON bottlenecks (severity DESC);
CREATE INDEX IF NOT EXISTS idx_bottlenecks_unresolved ON bottlenecks (resolved_at) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_bottlenecks_area ON bottlenecks (area);
CREATE INDEX IF NOT EXISTS idx_bottlenecks_type ON bottlenecks (bottleneck_type);

-- ========================================
-- TABLE: time_summaries
-- ========================================
-- Rolling summaries of user activity across timeframes
-- Token limits enforced in application layer

CREATE TABLE IF NOT EXISTS time_summaries (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID,
    timeframe TEXT NOT NULL CHECK (timeframe IN ('yesterday', 'week', 'month', '3month', '6month', 'year')),
    summary_text TEXT NOT NULL,
    patterns_identified JSONB,
    key_breakthroughs JSONB,
    habit_stats JSONB,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_time_summaries_unique ON time_summaries (user_id, timeframe);
CREATE INDEX IF NOT EXISTS idx_time_summaries_updated ON time_summaries (last_updated DESC);
CREATE INDEX IF NOT EXISTS idx_time_summaries_timeframe ON time_summaries (timeframe);

-- ========================================
-- TABLE: goal_queue
-- ========================================
-- Manages paused goals waiting to be reactivated
-- Preserves context about partially-completed goals

CREATE TABLE IF NOT EXISTS goal_queue (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID,
    goal_id UUID REFERENCES goals(id) ON DELETE CASCADE,
    area TEXT NOT NULL CHECK (area IN ('personal', 'work', 'education')),
    queue_position INTEGER NOT NULL,
    paused_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    tasks_completed_before_pause INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_goal_queue_area ON goal_queue (area, queue_position);
CREATE INDEX IF NOT EXISTS idx_goal_queue_position ON goal_queue (queue_position);
CREATE INDEX IF NOT EXISTS idx_goal_queue_goal ON goal_queue (goal_id);

-- ========================================
-- ROW LEVEL SECURITY (RLS)
-- ========================================
-- Enable RLS on all tables for future multi-user support
-- Currently using permissive policies for single-user mode

ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_inputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE bottlenecks ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE goal_queue ENABLE ROW LEVEL SECURITY;

-- Permissive policies (allow all operations for single user)
CREATE POLICY "Allow all for single user" ON goals FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for single user" ON tasks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for single user" ON daily_inputs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for single user" ON chat_messages FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for single user" ON bottlenecks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for single user" ON time_summaries FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for single user" ON goal_queue FOR ALL USING (true) WITH CHECK (true);

-- ========================================
-- MIGRATION NOTE
-- ========================================
-- If chat_history table already exists, run this migration:
--
-- ALTER TABLE chat_history RENAME TO chat_messages;
-- ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS goal_id UUID REFERENCES goals(id) ON DELETE SET NULL;
-- CREATE INDEX IF NOT EXISTS idx_chat_messages_goal ON chat_messages (goal_id);
--
-- ========================================

-- ========================================
-- TABLE: habits
-- ========================================
-- Stores user habits with frequency and reminder configuration
-- Habits can optionally link to goals to track correlation

CREATE TABLE IF NOT EXISTS habits (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID,
    title TEXT NOT NULL,
    description TEXT,

    -- Optional goal association (habits can be independent or support goals)
    goal_id UUID REFERENCES goals(id) ON DELETE SET NULL,
    area TEXT CHECK (area IN ('personal', 'work', 'education', 'general')),

    -- Frequency configuration
    frequency_type TEXT NOT NULL CHECK (frequency_type IN ('daily', 'weekly', 'custom')),
    frequency_config JSONB, -- { days: [0,1,2,3,4,5,6] } or { times_per_week: 3 }

    -- Reminder settings
    reminder_enabled BOOLEAN DEFAULT false,
    reminder_time TIME,
    reminder_config JSONB, -- { methods: ['push'], timezone: 'America/New_York' }

    -- Status and metadata
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived')),
    target_time_of_day TEXT CHECK (target_time_of_day IN ('morning', 'afternoon', 'evening', 'anytime')),
    color TEXT,
    icon TEXT,
    sort_order INTEGER DEFAULT 0,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    archived_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_habits_user ON habits (user_id);
CREATE INDEX IF NOT EXISTS idx_habits_goal ON habits (goal_id);
CREATE INDEX IF NOT EXISTS idx_habits_status ON habits (status);
CREATE INDEX IF NOT EXISTS idx_habits_area ON habits (area);

-- ========================================
-- TABLE: habit_completions
-- ========================================
-- Stores daily completion logs for habits
-- One completion per habit per day (enforced by UNIQUE constraint)

CREATE TABLE IF NOT EXISTS habit_completions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID,
    habit_id UUID NOT NULL REFERENCES habits(id) ON DELETE CASCADE,

    completion_date DATE NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Optional enrichment for pattern analysis
    notes TEXT,
    mood TEXT CHECK (mood IN ('great', 'good', 'okay', 'struggling', 'skipped')),
    duration_minutes INTEGER,
    completed_time_of_day TEXT CHECK (completed_time_of_day IN ('morning', 'afternoon', 'evening', 'night')),

    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(habit_id, completion_date)
);

CREATE INDEX IF NOT EXISTS idx_habit_completions_habit ON habit_completions (habit_id, completion_date DESC);
CREATE INDEX IF NOT EXISTS idx_habit_completions_date ON habit_completions (completion_date DESC);
CREATE INDEX IF NOT EXISTS idx_habit_completions_user_date ON habit_completions (user_id, completion_date DESC);

-- ========================================
-- TABLE: habit_streaks
-- ========================================
-- Cached statistics for habit streaks and completion rates
-- Updated after each completion to avoid expensive real-time calculations

CREATE TABLE IF NOT EXISTS habit_streaks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    habit_id UUID NOT NULL REFERENCES habits(id) ON DELETE CASCADE UNIQUE,
    user_id UUID,

    current_streak INTEGER DEFAULT 0,
    longest_streak INTEGER DEFAULT 0,
    total_completions INTEGER DEFAULT 0,

    completion_rate_7day DECIMAL(5,2),
    completion_rate_30day DECIMAL(5,2),
    completion_rate_all_time DECIMAL(5,2),

    last_completed_date DATE,
    last_calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_habit_streaks_habit ON habit_streaks (habit_id);
CREATE INDEX IF NOT EXISTS idx_habit_streaks_current ON habit_streaks (current_streak DESC);

-- ========================================
-- RLS: Enable for habits tables
-- ========================================

ALTER TABLE habits ENABLE ROW LEVEL SECURITY;
ALTER TABLE habit_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE habit_streaks ENABLE ROW LEVEL SECURITY;

-- Permissive policies (allow all operations for single user)
CREATE POLICY "Allow all for single user" ON habits FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for single user" ON habit_completions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for single user" ON habit_streaks FOR ALL USING (true) WITH CHECK (true);

-- ========================================
-- TABLE: health_data
-- ========================================
-- Unified storage for all Apple Health metrics
-- Supports steps, sleep, workouts, heart rate, and more
--
CREATE TABLE IF NOT EXISTS health_data (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,

  -- Core fields
  data_type TEXT NOT NULL CHECK (data_type IN (
    'steps', 'distance', 'flights', 'calories',
    'sleep', 'heart_rate', 'heart_rate_variability',
    'blood_pressure_systolic', 'blood_pressure_diastolic',
    'oxygen_saturation', 'workout', 'weight', 'body_fat'
  )),
  recorded_date DATE NOT NULL,
  recorded_at TIMESTAMP WITH TIME ZONE,

  -- Value storage
  value NUMERIC NOT NULL,
  unit TEXT NOT NULL, -- 'steps', 'hours', 'bpm', 'mmHg', 'kg', etc.

  -- Optional enrichment
  additional_data JSONB, -- { workout_type: 'running', sleep_quality: 'good', device: 'Apple Watch' }
  source TEXT DEFAULT 'apple_health',

  -- Timestamps
  imported_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indices for performance
CREATE INDEX IF NOT EXISTS idx_health_data_date ON health_data (recorded_date DESC);
CREATE INDEX IF NOT EXISTS idx_health_data_type ON health_data (data_type);
CREATE INDEX IF NOT EXISTS idx_health_data_user_date ON health_data (user_id, recorded_date DESC);
CREATE INDEX IF NOT EXISTS idx_health_data_type_date ON health_data (data_type, recorded_date DESC);
CREATE INDEX IF NOT EXISTS idx_health_data_user_type_date ON health_data (user_id, data_type, recorded_date DESC);

-- ========================================
-- RLS: Enable for health_data table
-- ========================================

ALTER TABLE health_data ENABLE ROW LEVEL SECURITY;

-- Permissive policy (allow all operations for single user)
CREATE POLICY "Allow all for single user" ON health_data FOR ALL USING (true) WITH CHECK (true);

-- ========================================
-- VERIFICATION QUERIES
-- ========================================
-- Run these to verify schema is correct:
--
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';
-- SELECT * FROM goals WHERE false;
-- SELECT * FROM tasks WHERE false;
-- SELECT * FROM daily_inputs WHERE false;
-- SELECT * FROM chat_messages WHERE false;
-- SELECT * FROM bottlenecks WHERE false;
-- SELECT * FROM time_summaries WHERE false;
-- SELECT * FROM goal_queue WHERE false;
-- SELECT * FROM habits WHERE false;
-- SELECT * FROM habit_completions WHERE false;
-- SELECT * FROM habit_streaks WHERE false;
-- SELECT * FROM health_data WHERE false;
--
-- ========================================

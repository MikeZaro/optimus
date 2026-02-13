/**
 * ========================================
 * Claude Chat API Server
 * ========================================
 * Express server that handles Claude API integration
 * and Supabase database operations for chat persistence
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { google } from 'googleapis';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateSummary } from './summaryGenerator.js';
import { detectBottlenecks, getUnresolvedBottlenecks, resolveBottleneck } from './bottleneckDetector.js';
import { generateInitialTasks, generateNextTask } from './taskCurator.js';
import { analyzeGoalPatterns, updateTimeSummaryPatterns, getTaskTypeEffectiveness } from './patternAnalyzer.js';
import { calculateStreak, updateHabitStreakCache } from './habitStreakCalculator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize Anthropic Claude API client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Initialize Supabase client with service role key for server-side operations
const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

const DEFAULT_CHAT_SYSTEM_PROMPT = 'You are a helpful AI assistant.';
const SUMMARY_CACHE_TTL_MS = 60 * 60 * 1000;
const summaryCache = new Map();

const buildErrorResponse = (error, fallbackMessage = 'Operation failed') => ({
  error: error?.message || fallbackMessage,
  details: process.env.NODE_ENV === 'development' ? error?.stack : undefined,
});

const sendInternalError = (res, error, fallbackMessage = 'Operation failed') => {
  res.status(500).json(buildErrorResponse(error, fallbackMessage));
};

const parseIcsDate = (rawValue) => {
  if (!rawValue) return null;
  const value = rawValue.trim();

  if (/^\d{8}$/.test(value)) {
    const year = Number(value.slice(0, 4));
    const month = Number(value.slice(4, 6)) - 1;
    const day = Number(value.slice(6, 8));
    return new Date(year, month, day, 0, 0, 0, 0);
  }

  const match = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (!match) return null;

  const [, y, m, d, hh, mm, ss, z] = match;
  if (z === 'Z') {
    return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss)));
  }

  return new Date(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss));
};

const unfoldIcsLines = (text) => (text || '').replace(/\r?\n[ \t]/g, '');

const parseIcsEvents = (icsText) => {
  const events = [];
  const unfolded = unfoldIcsLines(icsText);
  const blocks = unfolded.split('BEGIN:VEVENT').slice(1);

  blocks.forEach((block) => {
    const vevent = block.split('END:VEVENT')[0] || '';
    const lines = vevent.split(/\r?\n/).filter(Boolean);

    const event = {
      title: 'Untitled event',
      start: null,
      allDay: false,
    };

    lines.forEach((line) => {
      const [left, ...rest] = line.split(':');
      if (!left || rest.length === 0) return;
      const value = rest.join(':');
      const key = left.split(';')[0];
      const params = left.split(';').slice(1).join(';');

      if (key === 'SUMMARY') event.title = value;
      if (key === 'DTSTART') {
        event.start = parseIcsDate(value);
        if (params.includes('VALUE=DATE')) event.allDay = true;
      }
    });

    if (event.start) {
      events.push(event);
    }
  });

  return events;
};

const toDateKey = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const OAUTH_SCOPES = ['https://www.googleapis.com/auth/calendar.events'];
const OAUTH_TOKEN_PATH = path.resolve(__dirname, '.google-calendar-token.json');

const getGoogleOauthConfig = () => {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID || '';
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET || '';
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI || `http://localhost:${PORT}/api/calendar/google/callback`;
  const enabled = Boolean(clientId && clientSecret && redirectUri);

  return {
    clientId,
    clientSecret,
    redirectUri,
    enabled,
  };
};

const createGoogleOAuthClient = () => {
  const { clientId, clientSecret, redirectUri, enabled } = getGoogleOauthConfig();
  if (!enabled) return null;
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
};

const loadGoogleTokens = async () => {
  try {
    const raw = await fs.readFile(OAUTH_TOKEN_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const saveGoogleTokens = async (tokens) => {
  await fs.writeFile(OAUTH_TOKEN_PATH, JSON.stringify(tokens, null, 2), 'utf8');
};

const clearGoogleTokens = async () => {
  try {
    await fs.unlink(OAUTH_TOKEN_PATH);
  } catch {
    // ignore if file doesn't exist
  }
};

const buildGoogleAuthUrl = () => {
  const oauth2Client = createGoogleOAuthClient();
  if (!oauth2Client) return null;

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: OAUTH_SCOPES,
    include_granted_scopes: true,
  });
};

const getAuthorizedGoogleClient = async () => {
  const oauth2Client = createGoogleOAuthClient();
  if (!oauth2Client) {
    return { client: null, reason: 'oauth_not_configured' };
  }

  const tokens = await loadGoogleTokens();
  if (!tokens?.access_token && !tokens?.refresh_token) {
    return { client: null, reason: 'not_connected' };
  }

  oauth2Client.setCredentials(tokens);
  return { client: oauth2Client, reason: null };
};

/**
 * Get current timestamp in New York timezone
 */
const getNYTimestamp = () => {
  return new Date().toLocaleString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
};

const buildIntervention = (type, message) => ({
  type,
  message,
  prompt: `You are a supportive, practical coach. Keep your response concise and empathetic. Start with this exact sentence: "${message}" Then ask 1-2 focused follow-up questions and offer one concrete next step.`,
});

const getInterventionTemplate = (type) => {
  if (type === 'sustained_skip') {
    return buildIntervention(
      'sustained_skip',
      "I've noticed you've been skipping tasks lately. Want to talk about what's going on? We could adjust the approach or pause this area if it's not a priority right now."
    );
  }

  if (type === 'rapid_switching') {
    return buildIntervention(
      'rapid_switching',
      "I notice you've switched goals a few times this week. That's totally fine, but I want to make sure I'm helping effectively. What's driving these changes?"
    );
  }

  if (type === 'goal_stall') {
    return buildIntervention(
      'goal_stall',
      "I see you haven't made progress on this goal lately. Is this still a priority? Let's troubleshoot together. What's getting in the way?"
    );
  }

  if (type === 'all_skipped') {
    return buildIntervention(
      'all_skipped',
      "I see you're skipping a lot of tasks. That tells me something's off. Want to help me understand what's not working? Maybe tasks are too ambitious, not aligned with priorities, or you're feeling overwhelmed?"
    );
  }

  if (type === 'quick_win') {
    return buildIntervention(
      'quick_win',
      "Huge win - you completed this goal fast. Nice execution. Want to set a slightly bigger next goal while momentum is high?"
    );
  }

  return null;
};

const getCachedSummary = async (timeframe) => {
  const cached = summaryCache.get(timeframe);
  if (cached && Date.now() - cached.timestamp < SUMMARY_CACHE_TTL_MS) {
    return cached.data;
  }

  const { data, error } = await supabase
    .from('time_summaries')
    .select('*')
    .eq('timeframe', timeframe)
    .maybeSingle();

  if (error) throw error;

  summaryCache.set(timeframe, {
    data: data || null,
    timestamp: Date.now(),
  });

  return data || null;
};

const BOOTSTRAP_BOTTLENECK_TYPES = [
  'time_management',
  'follow_up_consistency',
  'technical_skills',
  'decision_paralysis',
  'energy_motivation',
  'prioritization',
];

const normalizeSeverity = (value) => {
  const parsed = Number(value);
  if (Number.isNaN(parsed)) return 5;
  return Math.min(10, Math.max(1, Math.round(parsed)));
};

const parseJsonResponse = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    const match = text?.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('AI response was not valid JSON');
    return JSON.parse(match[0]);
  }
};

const gatherGoalAiContext = async (goal) => {
  const goalId = goal.id;

  const [
    { data: tasksData },
    { data: areaGoalHistory },
    { data: dailyInputs },
  ] = await Promise.all([
    supabase
      .from('tasks')
      .select('id, content, completed_at, skipped_at, created_at')
      .eq('goal_id', goalId)
      .order('created_at', { ascending: false })
      .limit(40),
    supabase
      .from('goals')
      .select('id, title, status, completion_notes, incomplete_reason, created_at, completed_at')
      .eq('area', goal.area)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('daily_inputs')
      .select('response_text, created_at')
      .order('created_at', { ascending: false })
      .limit(15),
  ]);

  const completedTaskCount = (tasksData || []).filter((task) => Boolean(task.completed_at)).length;
  const skippedTaskCount = (tasksData || []).filter((task) => Boolean(task.skipped_at)).length;
  const totalTaskActivity = completedTaskCount + skippedTaskCount;
  const completionRate = totalTaskActivity > 0
    ? Math.round((completedTaskCount / totalTaskActivity) * 100)
    : 0;

  return {
    tasks: tasksData || [],
    areaGoalHistory: areaGoalHistory || [],
    dailyInputs: dailyInputs || [],
    completedTaskCount,
    skippedTaskCount,
    completionRate,
  };
};

const buildBootstrapPrompt = (goal, context) => {
  const recentCompletions = context.areaGoalHistory
    .filter((row) => row.status === 'completed' && row.completion_notes)
    .slice(0, 5)
    .map((row) => `- ${row.title}: ${row.completion_notes}`);
  const recentIncompleteReasons = context.areaGoalHistory
    .filter((row) => row.incomplete_reason)
    .slice(0, 5)
    .map((row) => `- ${row.title}: ${row.incomplete_reason}`);

  return `You are an AI productivity strategist.
Analyze this goal and user behavior context, then produce ONE primary limiting factor and 3-7 actionable tasks.

Goal title: ${goal.title}
Goal area: ${goal.area}
Goal description: ${goal.description || 'None'}
Goal notes: ${goal.notes || 'None'}
Current status: ${goal.status || 'active'}

Task activity for this goal:
- Completed count: ${context.completedTaskCount}
- Skipped count: ${context.skippedTaskCount}
- Completion rate: ${context.completionRate}%

Recent task entries:
${context.tasks.slice(0, 10).map((task) => `- ${task.content} | completed=${Boolean(task.completed_at)} skipped=${Boolean(task.skipped_at)}`).join('\n') || '- none'}

Recent completion notes (same area):
${recentCompletions.join('\n') || '- none'}

Recent incomplete reasons (same area):
${recentIncompleteReasons.join('\n') || '- none'}

Recent daily logs:
${context.dailyInputs.slice(0, 10).map((log) => `- ${log.response_text}`).join('\n') || '- none'}

Return JSON only in this exact shape:
{
  "bottleneck": {
    "title": "short limiting factor title",
    "bottleneck_type": "one of: ${BOOTSTRAP_BOTTLENECK_TYPES.join(', ')}",
    "explanation": "clear explanation",
    "severity": 1
  },
  "tasks": [
    { "title": "task title", "description": "task detail" }
  ]
}

Rules:
- Give exactly one limiting factor.
- severity must be integer 1-10.
- tasks count must be between 3 and 7.
- tasks should be realistic and immediately actionable.
- avoid multi-day phrasing like "over the next few days".`;
};

const insertBootstrapArtifacts = async (goal, aiResult) => {
  const bottleneckType = BOOTSTRAP_BOTTLENECK_TYPES.includes(aiResult?.bottleneck?.bottleneck_type)
    ? aiResult.bottleneck.bottleneck_type
    : 'prioritization';

  const bottleneckDescription = aiResult?.bottleneck?.explanation || 'AI identified a potential bottleneck.';
  const bottleneckSeverity = normalizeSeverity(aiResult?.bottleneck?.severity);

  const { data: insertedBottleneck, error: bottleneckInsertError } = await supabase
    .from('bottlenecks')
    .insert({
      area: goal.area,
      goal_id: goal.id,
      bottleneck_type: bottleneckType,
      severity: bottleneckSeverity,
      description: bottleneckDescription,
    })
    .select()
    .single();

  if (bottleneckInsertError) throw bottleneckInsertError;

  const tasks = Array.isArray(aiResult?.tasks) ? aiResult.tasks.slice(0, 7) : [];
  const sanitizedTasks = tasks
    .map((task, index) => ({
      goal_id: goal.id,
      area: goal.area,
      content: `${task?.title || 'Task'}${task?.description ? `: ${task.description}` : ''}`.trim(),
      source: 'ai_curated',
      sequence_position: index + 1,
      presented_at: new Date().toISOString(),
    }))
    .filter((task) => task.content && task.content.length > 0)
    .slice(0, 7);

  if (sanitizedTasks.length < 3) {
    throw new Error('AI returned insufficient tasks for bootstrap');
  }

  const { data: insertedTasks, error: tasksInsertError } = await supabase
    .from('tasks')
    .insert(sanitizedTasks)
    .select();

  if (tasksInsertError) throw tasksInsertError;

  return {
    bottleneck: insertedBottleneck,
    tasks: insertedTasks || [],
  };
};

const insertSingleBottleneck = async (goal, aiResult) => {
  const bottleneckType = BOOTSTRAP_BOTTLENECK_TYPES.includes(aiResult?.bottleneck?.bottleneck_type)
    ? aiResult.bottleneck.bottleneck_type
    : 'prioritization';

  const bottleneckDescription = aiResult?.bottleneck?.explanation || 'AI identified a potential bottleneck.';
  const bottleneckSeverity = normalizeSeverity(aiResult?.bottleneck?.severity);

  const { data: insertedBottleneck, error: bottleneckInsertError } = await supabase
    .from('bottlenecks')
    .insert({
      area: goal.area,
      goal_id: goal.id,
      bottleneck_type: bottleneckType,
      severity: bottleneckSeverity,
      description: bottleneckDescription,
    })
    .select()
    .single();

  if (bottleneckInsertError) throw bottleneckInsertError;
  return insertedBottleneck;
};

async function resolveGoalContext(sessionId, goalId) {
  if (goalId) return goalId;

  if (sessionId) {
    const { data: latestGoalMessage, error: latestGoalMessageError } = await supabase
      .from('chat_messages')
      .select('goal_id')
      .eq('session_id', sessionId)
      .not('goal_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestGoalMessageError) throw latestGoalMessageError;
    if (latestGoalMessage?.goal_id) return latestGoalMessage.goal_id;
  }

  const { data: activeGoal, error: activeGoalError } = await supabase
    .from('goals')
    .select('id')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (activeGoalError) throw activeGoalError;
  return activeGoal?.id || null;
}

async function checkInterventions(sessionId, goalId) {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  // Edge case: user keeps skipping tasks globally with zero completions.
  const [
    { count: skippedCount, error: skippedCountError },
    { count: completedCount, error: completedCountError },
  ] = await Promise.all([
    supabase
      .from('tasks')
      .select('*', { count: 'exact', head: true })
      .is('completed_at', null)
      .not('skipped_at', 'is', null),
    supabase
      .from('tasks')
      .select('*', { count: 'exact', head: true })
      .not('completed_at', 'is', null),
  ]);

  if (skippedCountError) throw skippedCountError;
  if (completedCountError) throw completedCountError;

  if ((skippedCount || 0) >= 20 && (completedCount || 0) === 0) {
    return getInterventionTemplate('all_skipped');
  }

  const effectiveGoalId = await resolveGoalContext(sessionId, goalId);

  let completed = [];
  if (effectiveGoalId) {
    const { data: recentTasks, error: recentTasksError } = await supabase
      .from('tasks')
      .select('id, skipped_at, completed_at, created_at')
      .eq('goal_id', effectiveGoalId)
      .gte('created_at', sevenDaysAgo.toISOString());

    if (recentTasksError) throw recentTasksError;

    const tasks = recentTasks || [];
    const skipped = tasks.filter((task) => task.skipped_at);
    completed = tasks.filter((task) => task.completed_at);

    if (skipped.length >= 5 && completed.length === 0) {
      return getInterventionTemplate('sustained_skip');
    }
  }

  const { data: recentGoals, error: recentGoalsError } = await supabase
    .from('goals')
    .select('id, created_at')
    .gte('created_at', sevenDaysAgo.toISOString())
    .order('created_at', { ascending: false });

  if (recentGoalsError) throw recentGoalsError;

  if ((recentGoals || []).length >= 3) {
    return getInterventionTemplate('rapid_switching');
  }

  if (effectiveGoalId) {
    const { data: goal, error: goalError } = await supabase
      .from('goals')
      .select('id, created_at')
      .eq('id', effectiveGoalId)
      .maybeSingle();

    if (goalError) throw goalError;

    if (goal?.created_at) {
      const daysSinceCreated = Math.floor(
        (Date.now() - new Date(goal.created_at).getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysSinceCreated >= 21 && completed.length === 0) {
        return getInterventionTemplate('goal_stall');
      }
    }
  }

  // Edge case: celebrate very fast goal completion and suggest bigger next step.
  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

  const { data: quickWinGoal, error: quickWinGoalError } = await supabase
    .from('goals')
    .select('id, created_at, completed_at, completion_task_count')
    .eq('status', 'completed')
    .not('completed_at', 'is', null)
    .gte('completed_at', threeDaysAgo.toISOString())
    .order('completed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (quickWinGoalError) throw quickWinGoalError;

  if (quickWinGoal?.created_at && quickWinGoal?.completed_at) {
    const daysSinceCreated = Math.floor(
      (new Date(quickWinGoal.completed_at).getTime() - new Date(quickWinGoal.created_at).getTime()) /
      (1000 * 60 * 60 * 24)
    );

    if ((quickWinGoal.completion_task_count || 0) <= 3 && daysSinceCreated <= 3) {
      return getInterventionTemplate('quick_win');
    }
  }

  return null;
}

/**
 * Health check endpoint
 */
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Claude Chat API is running' });
});

/**
 * Google Calendar OAuth status
 * GET /api/calendar/google/status
 */
app.get('/api/calendar/google/status', async (req, res) => {
  try {
    const oauth = getGoogleOauthConfig();
    const tokens = await loadGoogleTokens();
    res.json({
      oauthConfigured: oauth.enabled,
      connected: Boolean(tokens?.access_token || tokens?.refresh_token),
      authUrl: oauth.enabled ? buildGoogleAuthUrl() : null,
    });
  } catch (error) {
    console.error('Google status check failed:', error);
    sendInternalError(res, error, 'Google status check failed');
  }
});

/**
 * Start OAuth flow
 * GET /api/calendar/google/auth-url
 */
app.get('/api/calendar/google/auth-url', (req, res) => {
  const authUrl = buildGoogleAuthUrl();
  if (!authUrl) {
    return res.status(400).json({
      error: 'Google OAuth not configured. Set GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REDIRECT_URI.',
    });
  }
  res.json({ authUrl });
});

/**
 * OAuth callback
 * GET /api/calendar/google/callback
 */
app.get('/api/calendar/google/callback', async (req, res) => {
  const code = req.query.code;
  const oauth2Client = createGoogleOAuthClient();
  const redirectAfterAuth = process.env.GOOGLE_OAUTH_SUCCESS_REDIRECT || 'http://localhost:5173/calendar';

  if (!oauth2Client) {
    return res.status(400).send('Google OAuth not configured.');
  }

  if (!code) {
    return res.status(400).send('Missing OAuth code.');
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    await saveGoogleTokens(tokens);
    return res.redirect(`${redirectAfterAuth}?google_connected=1`);
  } catch (error) {
    console.error('Google OAuth callback failed:', error);
    return res.status(500).send('Google OAuth failed. Check server logs.');
  }
});

/**
 * Disconnect Google Calendar
 * POST /api/calendar/google/disconnect
 */
app.post('/api/calendar/google/disconnect', async (req, res) => {
  try {
    await clearGoogleTokens();
    res.json({ success: true });
  } catch (error) {
    console.error('Google disconnect failed:', error);
    sendInternalError(res, error, 'Google disconnect failed');
  }
});

/**
 * Calendar events by date from Google Calendar API
 * GET /api/calendar/events?date=YYYY-MM-DD
 */
app.get('/api/calendar/events', async (req, res) => {
  const apiKey = process.env.GOOGLE_CALENDAR_API_KEY;
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  const date = req.query.date;

  if (!apiKey || !calendarId) {
    return res.status(400).json({
      error: 'Calendar not configured. Set GOOGLE_CALENDAR_API_KEY and GOOGLE_CALENDAR_ID in .env.local.',
    });
  }

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'date query param must be YYYY-MM-DD' });
  }

  try {
    // Build time range for the selected date (in UTC)
    const timeMin = `${date}T00:00:00-05:00`;  // Eastern Time start of day
    const timeMax = `${date}T23:59:59-05:00`;  // Eastern Time end of day

    // Call Google Calendar API
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
    const params = new URLSearchParams({
      key: apiKey,
      timeMin: timeMin,
      timeMax: timeMax,
      singleEvents: 'true',
      orderBy: 'startTime'
    });

    const response = await fetch(`${url}?${params}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Google Calendar API error:', errorText);
      return res.status(502).json({
        error: `Google Calendar API error (${response.status})`,
        details: errorText
      });
    }

    const data = await response.json();

    // Transform Google Calendar events to rich format for list + details panel.
    const events = (data.items || []).map((event) => {
      const isAllDay = !event.start?.dateTime;
      const startDateTime = event.start?.dateTime ? new Date(event.start.dateTime) : null;
      const endDateTime = event.end?.dateTime ? new Date(event.end.dateTime) : null;
      const eventDate = isAllDay
        ? (event.start?.date || date)
        : (startDateTime ? startDateTime.toISOString().slice(0, 10) : date);

      const startTime = isAllDay
        ? 'All day'
        : (startDateTime
          ? startDateTime.toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
              timeZone: 'America/New_York',
            })
          : '');

      const endTime = isAllDay
        ? 'All day'
        : (endDateTime
          ? endDateTime.toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
              timeZone: 'America/New_York',
            })
          : '');

      return {
        id: event.id || `${event.summary || 'event'}-${eventDate}`,
        title: event.summary || 'Untitled event',
        allDay: isAllDay,
        start: isAllDay ? (event.start?.date || '') : (event.start?.dateTime || ''),
        startTime,
        endTime,
        date: eventDate,
        description: event.description || '',
        location: event.location || '',
        timeLabel: startTime,
      };
    });

    res.json({ date, events });
  } catch (error) {
    console.error('Google Calendar fetch failed:', error);
    res.status(500).json({
      error: 'Failed to fetch calendar events',
      details: error.message
    });
  }
});

/**
 * Create Google Calendar event directly
 * POST /api/calendar/google/create-event
 */
app.post('/api/calendar/google/create-event', async (req, res) => {
  const { title, date, startTime, endTime, details, location, timeZone } = req.body || {};
  const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';
  const resolvedTimeZone = timeZone || 'America/New_York';

  if (!title || !date || !startTime || !endTime) {
    return res.status(400).json({
      error: 'Missing required fields: title, date, startTime, endTime',
    });
  }

  const { client, reason } = await getAuthorizedGoogleClient();
  if (!client) {
    return res.status(401).json({
      error: reason === 'oauth_not_configured'
        ? 'Google OAuth not configured on server.'
        : 'Google Calendar is not connected yet.',
      authUrl: buildGoogleAuthUrl(),
    });
  }

  try {
    const calendar = google.calendar({ version: 'v3', auth: client });
    const startDateTime = `${date}T${startTime}:00`;
    const endDateTime = `${date}T${endTime}:00`;

    const response = await calendar.events.insert({
      calendarId,
      requestBody: {
        summary: title,
        description: details || undefined,
        location: location || undefined,
        start: { dateTime: startDateTime, timeZone: resolvedTimeZone },
        end: { dateTime: endDateTime, timeZone: resolvedTimeZone },
      },
    });

    res.json({
      success: true,
      event: {
        id: response.data.id,
        title: response.data.summary,
        htmlLink: response.data.htmlLink,
      },
    });
  } catch (error) {
    console.error('Google create event failed:', error);
    sendInternalError(res, error, 'Failed to create Google Calendar event');
  }
});

/**
 * Test which models are available
 */
app.get('/api/test-models', async (req, res) => {
  const modelsToTest = [
    'claude-3-5-sonnet-20241022',
    'claude-3-opus-20240229',
    'claude-3-sonnet-20240229',
    'claude-3-haiku-20240307',
  ];

  const results = {};

  for (const model of modelsToTest) {
    try {
      await anthropic.messages.create({
        model: model,
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Hi' }],
      });
      results[model] = '✅ Available';
    } catch (error) {
      results[model] = `❌ ${error.status}: ${error.message}`;
    }
  }

  res.json({ available_models: results });
});

/**
 * ========================================
 * POST /api/chat
 * ========================================
 * Main chat endpoint that:
 * 1. Receives user message
 * 2. Saves user message to Supabase
 * 3. Fetches conversation history
 * 4. Sends to Claude API with context
 * 5. Saves Claude response to Supabase
 * 6. Returns Claude response to client
 */
app.post('/api/chat', async (req, res) => {
  try {
    console.log('📨 Received chat request');
    const { message, sessionId, goalId } = req.body;
    console.log('Message:', message);
    console.log('Session ID:', sessionId);
    console.log('Goal ID:', goalId || 'none');

    // Validation
    if (!message || !sessionId) {
      return res.status(400).json({
        error: 'Missing required fields: message and sessionId',
      });
    }

    // Step 1: Save user message to Supabase with goal context
    const { error: userSaveError } = await supabase
      .from('chat_messages')
      .insert({
        session_id: sessionId,
        role: 'user',
        content: message,
        goal_id: goalId || null, // Link to goal if detected
        created_at: new Date().toISOString(),
      });

    if (userSaveError) {
      console.error('Error saving user message:', userSaveError);
      return sendInternalError(res, userSaveError, 'Failed to save user message');
    }

    // Step 2: Fetch conversation history for context
    const { data: history, error: historyError } = await supabase
      .from('chat_messages')
      .select('role, content')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    if (historyError) {
      console.error('Error fetching history:', historyError);
      return sendInternalError(res, historyError, 'Failed to fetch conversation history');
    }

    // Step 3: Check intervention triggers before calling Claude
    const intervention = await checkInterventions(sessionId, goalId);
    const systemPrompt = intervention?.prompt || DEFAULT_CHAT_SYSTEM_PROMPT;

    // Step 4: Format messages for Claude API
    // Claude expects alternating user/assistant messages
    const messages = history.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    // Step 5: Call Claude API
    const response = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307', // Claude Haiku 3 (fast, available)
      max_tokens: 4096,
      system: systemPrompt,
      messages: messages,
    });

    // Extract Claude's response
    const assistantMessage = response.content[0].text;

    // Step 6: Save Claude response to Supabase with same goal context
    const { error: assistantSaveError } = await supabase
      .from('chat_messages')
      .insert({
        session_id: sessionId,
        role: 'assistant',
        content: assistantMessage,
        goal_id: goalId || null, // Same goal as user message
        created_at: new Date().toISOString(),
      });

    if (assistantSaveError) {
      console.error('Error saving assistant message:', assistantSaveError);
      return sendInternalError(res, assistantSaveError, 'Failed to save assistant message');
    }

    // Step 7: Return response to client
    res.json({
      message: assistantMessage,
      sessionId: sessionId,
      interventionType: intervention?.type || null,
    });

  } catch (error) {
    console.error('❌ Chat API error:', error);
    console.error('Error stack:', error.stack);
    sendInternalError(res, error, 'Internal server error');
  }
});

/**
 * ========================================
 * GET /api/chat/history/:sessionId
 * ========================================
 * Retrieves conversation history for a specific session
 * Used when loading a previous conversation
 */
app.get('/api/chat/history/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    const { data, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching history:', error);
      return sendInternalError(res, error, 'Failed to fetch history');
    }

    res.json({ history: data });
  } catch (error) {
    console.error('History fetch error:', error);
    sendInternalError(res, error, 'Internal server error');
  }
});

/**
 * ========================================
 * DELETE /api/chat/history/:sessionId
 * ========================================
 * Deletes all messages for a specific session
 * Useful for clearing conversation history
 */
app.delete('/api/chat/history/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    const { error } = await supabase
      .from('chat_messages')
      .delete()
      .eq('session_id', sessionId);

    if (error) {
      console.error('Error deleting history:', error);
      return sendInternalError(res, error, 'Failed to delete history');
    }

    res.json({ message: 'History deleted successfully' });
  } catch (error) {
    console.error('History delete error:', error);
    sendInternalError(res, error, 'Internal server error');
  }
});

/**
 * ========================================
 * POST /api/chat/check-interventions
 * ========================================
 * Returns whether chatbot should proactively intervene
 */
app.post('/api/chat/check-interventions', async (req, res) => {
  const { sessionId, goalId } = req.body;

  try {
    const intervention = await checkInterventions(sessionId, goalId);

    if (intervention) {
      return res.json({
        shouldIntervene: true,
        message: intervention.message,
        type: intervention.type,
      });
    }

    res.json({ shouldIntervene: false });
  } catch (error) {
    console.error('Intervention check failed:', error);
    sendInternalError(res, error, 'Intervention check failed');
  }
});

/**
 * ========================================
 * POST /api/dev/interventions/trigger
 * ========================================
 * Dev-only endpoint to force intervention payloads for testing.
 * Disabled in production.
 */
app.post('/api/dev/interventions/trigger', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Not found' });
  }

  const configuredDevToken = process.env.DEV_INTERVENTION_TOKEN;
  if (configuredDevToken) {
    const providedToken = req.headers['x-dev-token'];
    if (providedToken !== configuredDevToken) {
      return res.status(403).json({ error: 'Invalid dev token' });
    }
  }

  const { type, sessionId, goalId } = req.body;
  const validTypes = ['sustained_skip', 'rapid_switching', 'goal_stall', 'all_skipped', 'quick_win', 'auto'];

  if (!type || !validTypes.includes(type)) {
    return res.status(400).json({
      error: 'Invalid type',
      validTypes,
    });
  }

  try {
    const intervention =
      type === 'auto'
        ? await checkInterventions(sessionId, goalId)
        : getInterventionTemplate(type);

    if (!intervention) {
      return res.json({
        shouldIntervene: false,
        message: 'No intervention triggered for current conditions.',
      });
    }

    res.json({
      shouldIntervene: true,
      type: intervention.type,
      message: intervention.message,
      prompt: intervention.prompt,
      source: type === 'auto' ? 'rule_engine' : 'forced_dev_trigger',
    });
  } catch (error) {
    console.error('Dev intervention trigger failed:', error);
    sendInternalError(res, error, 'Dev intervention trigger failed');
  }
});

/**
 * ========================================
 * OPTIMUS TIME SUMMARY ENDPOINTS
 * ========================================
 */

/**
 * Generate summary for a specific timeframe
 * POST /api/summaries/generate/:timeframe
 */
app.post('/api/summaries/generate/:timeframe', async (req, res) => {
  const { timeframe } = req.params;

  // Validate timeframe
  const validTimeframes = ['yesterday', 'week', 'month', '3month', '6month', 'year'];
  if (!validTimeframes.includes(timeframe)) {
    return res.status(400).json({
      error: 'Invalid timeframe',
      valid: validTimeframes,
    });
  }

  try {
    const result = await generateSummary(timeframe);
    summaryCache.delete(timeframe); // invalidate stale cache
    res.json({ success: true, summary: result });
  } catch (error) {
    console.error('Summary generation failed:', error);
    sendInternalError(res, error, 'Failed to generate summary');
  }
});

/**
 * Get existing summary for a timeframe
 * GET /api/summaries/:timeframe
 */
app.get('/api/summaries/:timeframe', async (req, res) => {
  const { timeframe } = req.params;

  try {
    const data = await getCachedSummary(timeframe);

    if (!data) {
      return res.json({
        exists: false,
        message: `No summary found for ${timeframe}`,
      });
    }

    res.json({
      exists: true,
      summary: data,
    });
  } catch (error) {
    console.error('Error fetching summary:', error);
    sendInternalError(res, error, 'Failed to fetch summary');
  }
});

/**
 * ========================================
 * OPTIMUS BOTTLENECK DETECTION ENDPOINTS
 * ========================================
 */

/**
 * Detect bottlenecks for a specific goal
 * POST /api/bottlenecks/detect/:goalId
 */
app.post('/api/bottlenecks/detect/:goalId', async (req, res) => {
  const { goalId } = req.params;

  try {
    const bottleneck = await detectBottlenecks(goalId);

    if (!bottleneck) {
      return res.json({
        success: true,
        bottleneck: null,
        message: 'No significant bottleneck detected',
      });
    }

    res.json({ success: true, bottleneck });
  } catch (error) {
    console.error('Bottleneck detection failed:', error);
    sendInternalError(res, error, 'Failed to detect bottlenecks');
  }
});

/**
 * Get unresolved bottlenecks for a goal
 * GET /api/bottlenecks/:goalId
 */
app.get('/api/bottlenecks/:goalId', async (req, res) => {
  const { goalId } = req.params;

  try {
    const bottlenecks = await getUnresolvedBottlenecks(goalId);
    res.json({ bottlenecks });
  } catch (error) {
    console.error('Error fetching bottlenecks:', error);
    sendInternalError(res, error, 'Failed to fetch bottlenecks');
  }
});

/**
 * Mark a bottleneck as resolved
 * POST /api/bottlenecks/resolve/:bottleneckId
 */
app.post('/api/bottlenecks/resolve/:bottleneckId', async (req, res) => {
  const { bottleneckId } = req.params;

  try {
    await resolveBottleneck(bottleneckId);
    res.json({
      success: true,
      message: 'Bottleneck marked as resolved',
    });
  } catch (error) {
    console.error('Error resolving bottleneck:', error);
    sendInternalError(res, error, 'Failed to resolve bottleneck');
  }
});

/**
 * ========================================
 * OPTIMUS AI TASK CURATOR ENDPOINTS
 * ========================================
 */

/**
 * Generate initial 3 tasks for a new goal
 * POST /api/curator/generate-tasks/:goalId
 */
app.post('/api/curator/generate-tasks/:goalId', async (req, res) => {
  const { goalId } = req.params;
  const { area } = req.body;

  try {
    // Use AI Task Curator to generate intelligent initial tasks
    const tasks = await generateInitialTasks(goalId, area);
    res.json({ success: true, tasks });
  } catch (error) {
    console.error('Task generation error:', error);
    sendInternalError(res, error, 'Failed to generate tasks');
  }
});

/**
 * Generate next task after completion/skip
 * POST /api/curator/next-task/:goalId
 */
app.post('/api/curator/next-task/:goalId', async (req, res) => {
  const { goalId } = req.params;
  const { area } = req.body;

  try {
    // Use AI Task Curator to generate intelligent next task
    const task = await generateNextTask(goalId, area);
    res.json({ success: true, task });
  } catch (error) {
    console.error('Next task generation error:', error);
    sendInternalError(res, error, 'Failed to generate next task');
  }
});

/**
 * Ensure AI tasks exist for a goal (non-destructive)
 * POST /api/goals/ensure-ai/:goalId
 * Generates missing tasks only if absent.
 */
app.post('/api/goals/ensure-ai/:goalId', async (req, res) => {
  const { goalId } = req.params;

  try {
    console.log(`[AI Ensure] Start goal_id=${goalId}`);

    const { data: goal, error: goalError } = await supabase
      .from('goals')
      .select('id, area, title, description, notes, completion_notes, incomplete_reason, status, created_at')
      .eq('id', goalId)
      .maybeSingle();

    if (goalError) throw goalError;
    if (!goal) {
      return res.status(404).json({ error: 'Goal not found' });
    }

    const { data: existingTasks, error: tasksCheckError } = await supabase
      .from('tasks')
      .select('id')
      .eq('goal_id', goalId)
      .limit(1);

    if (tasksCheckError) throw tasksCheckError;

    const shouldGenerateTasks = (existingTasks || []).length === 0;
    let tasksResult = null;
    if (shouldGenerateTasks) {
      console.log(`[AI Ensure] AI task generation triggered for goal: ${goalId}`);
      tasksResult = await generateInitialTasks(goalId, goal.area);
    }

    console.log('[AI Ensure] Result', {
      goalId,
      shouldGenerateTasks,
      generatedTasksCount: tasksResult?.length || 0,
    });

    res.json({
      success: true,
      goalId,
      generated: {
        tasks: shouldGenerateTasks ? (tasksResult?.length || 0) : 0,
        limitingFactor: false,
      },
      skipped: {
        tasksAlreadyExists: !shouldGenerateTasks,
      },
    });
  } catch (error) {
    console.error('[AI Ensure] Failed:', error);
    sendInternalError(res, error, 'Failed to ensure AI tasks');
  }
});

/**
 * Get goal queue for an area
 * GET /api/goal-queue/:area
 */
app.get('/api/goal-queue/:area', async (req, res) => {
  const { area } = req.params;

  try {
    const { data: queue, error } = await supabase
      .from('goal_queue')
      .select(`
        *,
        goals (*)
      `)
      .eq('area', area)
      .order('queue_position', { ascending: true });

    if (error) throw error;
    res.json({ queue: queue || [] });
  } catch (error) {
    console.error('Fetch queue failed:', error);
    sendInternalError(res, error, 'Fetch queue failed');
  }
});

/**
 * Reactivate a paused goal from queue
 * POST /api/goals/reactivate/:goalId
 */
app.post('/api/goals/reactivate/:goalId', async (req, res) => {
  const { goalId } = req.params;

  try {
    const { data: goal, error: goalError } = await supabase
      .from('goals')
      .select('*')
      .eq('id', goalId)
      .maybeSingle();

    if (goalError) throw goalError;

    if (!goal) {
      return res.status(404).json({ error: 'Goal not found' });
    }

    const { data: activeGoal, error: activeGoalError } = await supabase
      .from('goals')
      .select('*')
      .eq('area', goal.area)
      .eq('status', 'active')
      .neq('id', goalId)
      .maybeSingle();

    if (activeGoalError) throw activeGoalError;

    if (activeGoal) {
      const { data: completedTasks, error: completedTasksError } = await supabase
        .from('tasks')
        .select('id')
        .eq('goal_id', activeGoal.id)
        .not('completed_at', 'is', null);

      if (completedTasksError) throw completedTasksError;

      const { error: pauseError } = await supabase
        .from('goals')
        .update({ status: 'paused' })
        .eq('id', activeGoal.id);

      if (pauseError) throw pauseError;

      const { data: queuedGoal, error: queuedGoalError } = await supabase
        .from('goal_queue')
        .select('id')
        .eq('goal_id', activeGoal.id)
        .maybeSingle();

      if (queuedGoalError) throw queuedGoalError;

      if (!queuedGoal) {
        const { data: lastQueueItem, error: lastQueueItemError } = await supabase
          .from('goal_queue')
          .select('queue_position')
          .eq('area', activeGoal.area)
          .order('queue_position', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (lastQueueItemError) throw lastQueueItemError;

        const nextQueuePosition = (lastQueueItem?.queue_position ?? 0) + 1;

        const { error: queueInsertError } = await supabase
          .from('goal_queue')
          .insert({
            goal_id: activeGoal.id,
            area: activeGoal.area,
            queue_position: nextQueuePosition,
            tasks_completed_before_pause: completedTasks?.length || 0,
          });

        if (queueInsertError) throw queueInsertError;
      }
    }

    const { error: activateError } = await supabase
      .from('goals')
      .update({ status: 'active' })
      .eq('id', goalId);

    if (activateError) throw activateError;

    const { error: removeQueueError } = await supabase
      .from('goal_queue')
      .delete()
      .eq('goal_id', goalId);

    if (removeQueueError) throw removeQueueError;

    res.json({ success: true, goal });
  } catch (error) {
    console.error('Reactivate goal failed:', error);
    sendInternalError(res, error, 'Reactivate goal failed');
  }
});

/**
 * Reorder goal queue
 * POST /api/goal-queue/reorder
 */
app.post('/api/goal-queue/reorder', async (req, res) => {
  const { queueItems } = req.body; // Array of { id, queue_position }

  if (!Array.isArray(queueItems)) {
    return res.status(400).json({ error: 'queueItems must be an array' });
  }

  try {
    for (const item of queueItems) {
      if (!item?.id || typeof item.queue_position !== 'number') {
        return res.status(400).json({ error: 'Each queue item requires id and queue_position' });
      }

      const { error } = await supabase
        .from('goal_queue')
        .update({ queue_position: item.queue_position })
        .eq('id', item.id);

      if (error) throw error;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Reorder queue failed:', error);
    sendInternalError(res, error, 'Reorder queue failed');
  }
});

/**
 * Complete a goal and analyze patterns
 * POST /api/goals/complete/:goalId
 */
app.post('/api/goals/complete/:goalId', async (req, res) => {
  const { goalId } = req.params;

  try {
    const { data: goal, error: goalError } = await supabase
      .from('goals')
      .select('*')
      .eq('id', goalId)
      .maybeSingle();

    if (goalError) throw goalError;
    if (!goal) {
      return res.status(404).json({ error: 'Goal not found' });
    }

    // Count completed tasks
    const { data: completedTasks, error: completedTasksError } = await supabase
      .from('tasks')
      .select('id')
      .eq('goal_id', goalId)
      .not('completed_at', 'is', null);

    if (completedTasksError) throw completedTasksError;

    // Mark goal complete
    const { error: updateGoalError } = await supabase
      .from('goals')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        completion_task_count: completedTasks?.length || 0,
      })
      .eq('id', goalId);

    if (updateGoalError) throw updateGoalError;

    console.log(`Goal ${goalId} completed with ${completedTasks?.length || 0} tasks`);

    const completionTaskCount = completedTasks?.length || 0;
    const daysSinceCreated = Math.floor(
      (Date.now() - new Date(goal.created_at).getTime()) / (1000 * 60 * 60 * 24)
    );
    const isQuickWin = completionTaskCount <= 3 && daysSinceCreated <= 3;

    // Analyze patterns from completed goal
    const patterns = await analyzeGoalPatterns(goalId);

    // Update time summaries with new patterns
    if (patterns) {
      await updateTimeSummaryPatterns('week', goalId);
      await updateTimeSummaryPatterns('month', goalId);
    }

    res.json({
      success: true,
      completion_task_count: completionTaskCount,
      quick_win: isQuickWin
        ? {
            detected: true,
            message: getInterventionTemplate('quick_win')?.message,
          }
        : { detected: false },
      patterns,
    });
  } catch (error) {
    console.error('Goal completion error:', error);
    sendInternalError(res, error, 'Failed to process goal completion');
  }
});

/**
 * ========================================
 * PATTERN ANALYSIS ENDPOINTS
 * ========================================
 */

/**
 * Get pattern analysis for a specific goal
 * GET /api/patterns/:goalId
 */
app.get('/api/patterns/:goalId', async (req, res) => {
  const { goalId } = req.params;

  try {
    const patterns = await analyzeGoalPatterns(goalId);
    res.json({ patterns });
  } catch (error) {
    console.error('Pattern analysis failed:', error);
    sendInternalError(res, error, 'Failed to analyze patterns');
  }
});

/**
 * Get effectiveness of a specific task type
 * GET /api/patterns/effectiveness/:area/:taskType
 */
app.get('/api/patterns/effectiveness/:area/:taskType', async (req, res) => {
  const { area, taskType } = req.params;

  try {
    const effectiveness = await getTaskTypeEffectiveness(area, taskType);
    res.json({ effectiveness });
  } catch (error) {
    console.error('Task type effectiveness analysis failed:', error);
    sendInternalError(res, error, 'Failed to analyze task type effectiveness');
  }
});

/**
 * ========================================
 * HABIT TRACKING ENDPOINTS
 * ========================================
 */

/**
 * Get all habits (with optional filtering)
 * GET /api/habits?status=active&area=personal&goal_id=xxx
 */
app.get('/api/habits', async (req, res) => {
  const { status, area, goal_id } = req.query;

  try {
    let query = supabase
      .from('habits')
      .select(`
        *,
        habit_streaks (*)
      `)
      .order('created_at', { ascending: false });

    if (status) query = query.eq('status', status);
    if (area) query = query.eq('area', area);
    if (goal_id) query = query.eq('goal_id', goal_id);

    const { data, error } = await query;
    if (error) throw error;

    // Flatten streak data into habit object
    const habits = (data || []).map(habit => ({
      ...habit,
      current_streak: habit.habit_streaks[0]?.current_streak || 0,
      longest_streak: habit.habit_streaks[0]?.longest_streak || 0,
      total_completions: habit.habit_streaks[0]?.total_completions || 0,
      completion_rate_7day: habit.habit_streaks[0]?.completion_rate_7day || 0,
      completion_rate_30day: habit.habit_streaks[0]?.completion_rate_30day || 0,
      last_completed_date: habit.habit_streaks[0]?.last_completed_date || null,
      habit_streaks: undefined, // Remove nested object
    }));

    res.json({ habits });
  } catch (error) {
    console.error('Failed to fetch habits:', error);
    sendInternalError(res, error, 'Failed to fetch habits');
  }
});

/**
 * Get single habit with streak stats
 * GET /api/habits/:habitId
 */
app.get('/api/habits/:habitId', async (req, res) => {
  const { habitId } = req.params;

  try {
    const { data: habit, error: habitError } = await supabase
      .from('habits')
      .select(`
        *,
        habit_streaks (*)
      `)
      .eq('id', habitId)
      .single();

    if (habitError) throw habitError;
    if (!habit) return res.status(404).json({ error: 'Habit not found' });

    // Flatten streak data
    const habitData = {
      ...habit,
      current_streak: habit.habit_streaks[0]?.current_streak || 0,
      longest_streak: habit.habit_streaks[0]?.longest_streak || 0,
      total_completions: habit.habit_streaks[0]?.total_completions || 0,
      completion_rate_7day: habit.habit_streaks[0]?.completion_rate_7day || 0,
      completion_rate_30day: habit.habit_streaks[0]?.completion_rate_30day || 0,
      last_completed_date: habit.habit_streaks[0]?.last_completed_date || null,
      habit_streaks: undefined,
    };

    res.json({ habit: habitData });
  } catch (error) {
    console.error('Failed to fetch habit:', error);
    sendInternalError(res, error, 'Failed to fetch habit');
  }
});

/**
 * Create new habit
 * POST /api/habits
 */
app.post('/api/habits', async (req, res) => {
  const {
    title,
    description,
    goal_id,
    area,
    frequency_type,
    frequency_config,
    target_time_of_day,
    reminder_enabled,
    reminder_time,
    reminder_config,
  } = req.body;

  if (!title || !frequency_type) {
    return res.status(400).json({ error: 'Title and frequency_type are required' });
  }

  try {
    const { data: habit, error: habitError } = await supabase
      .from('habits')
      .insert({
        title: title.trim(),
        description: description?.trim() || null,
        goal_id: goal_id || null,
        area: area || 'general',
        frequency_type,
        frequency_config: frequency_config || null,
        target_time_of_day: target_time_of_day || 'anytime',
        reminder_enabled: reminder_enabled || false,
        reminder_time: reminder_time || null,
        reminder_config: reminder_config || null,
        status: 'active',
      })
      .select()
      .single();

    if (habitError) throw habitError;

    // Initialize streak record
    const { error: streakError } = await supabase
      .from('habit_streaks')
      .insert({
        habit_id: habit.id,
        current_streak: 0,
        longest_streak: 0,
        total_completions: 0,
      });

    if (streakError) throw streakError;

    res.json({ habit });
  } catch (error) {
    console.error('Failed to create habit:', error);
    sendInternalError(res, error, 'Failed to create habit');
  }
});

/**
 * Update habit
 * PATCH /api/habits/:habitId
 */
app.patch('/api/habits/:habitId', async (req, res) => {
  const { habitId } = req.params;
  const updates = req.body;

  // Remove fields that shouldn't be updated via PATCH
  delete updates.id;
  delete updates.created_at;
  delete updates.user_id;

  // Set updated_at
  updates.updated_at = new Date().toISOString();

  try {
    const { data: habit, error } = await supabase
      .from('habits')
      .update(updates)
      .eq('id', habitId)
      .select()
      .single();

    if (error) throw error;
    if (!habit) return res.status(404).json({ error: 'Habit not found' });

    res.json({ habit });
  } catch (error) {
    console.error('Failed to update habit:', error);
    sendInternalError(res, error, 'Failed to update habit');
  }
});

/**
 * Archive habit (soft delete)
 * DELETE /api/habits/:habitId
 */
app.delete('/api/habits/:habitId', async (req, res) => {
  const { habitId } = req.params;

  try {
    const { data: habit, error } = await supabase
      .from('habits')
      .update({
        status: 'archived',
        archived_at: new Date().toISOString(),
      })
      .eq('id', habitId)
      .select()
      .single();

    if (error) throw error;
    if (!habit) return res.status(404).json({ error: 'Habit not found' });

    res.json({ habit, message: 'Habit archived successfully' });
  } catch (error) {
    console.error('Failed to archive habit:', error);
    sendInternalError(res, error, 'Failed to archive habit');
  }
});

/**
 * Log habit completion for today
 * POST /api/habits/:habitId/complete
 */
app.post('/api/habits/:habitId/complete', async (req, res) => {
  const { habitId } = req.params;
  const { notes, mood, duration_minutes } = req.body;

  const today = new Date().toISOString().split('T')[0];
  const now = new Date();
  const hour = now.getHours();

  // Determine time of day
  let completed_time_of_day = 'evening';
  if (hour >= 5 && hour < 12) completed_time_of_day = 'morning';
  else if (hour >= 12 && hour < 17) completed_time_of_day = 'afternoon';
  else if (hour >= 17 && hour < 21) completed_time_of_day = 'evening';
  else completed_time_of_day = 'night';

  try {
    // Insert completion (will fail if already exists due to UNIQUE constraint)
    const { data: completion, error: completionError } = await supabase
      .from('habit_completions')
      .insert({
        habit_id: habitId,
        completion_date: today,
        completed_at: now.toISOString(),
        notes: notes?.trim() || null,
        mood: mood || null,
        duration_minutes: duration_minutes || null,
        completed_time_of_day,
      })
      .select()
      .single();

    if (completionError) {
      if (completionError.code === '23505') { // Unique constraint violation
        return res.status(409).json({ error: 'Habit already completed today' });
      }
      throw completionError;
    }

    // Update streak cache
    const streakStats = await updateHabitStreakCache(habitId);

    res.json({
      completion,
      streak: streakStats,
      message: 'Habit completed successfully',
    });
  } catch (error) {
    console.error('Failed to complete habit:', error);
    sendInternalError(res, error, 'Failed to complete habit');
  }
});

/**
 * Undo habit completion for a specific date
 * DELETE /api/habits/:habitId/completions/:date
 */
app.delete('/api/habits/:habitId/completions/:date', async (req, res) => {
  const { habitId, date } = req.params;

  try {
    const { data: completion, error } = await supabase
      .from('habit_completions')
      .delete()
      .eq('habit_id', habitId)
      .eq('completion_date', date)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Completion not found' });
      }
      throw error;
    }

    // Update streak cache
    const streakStats = await updateHabitStreakCache(habitId);

    res.json({
      message: 'Completion removed successfully',
      streak: streakStats,
    });
  } catch (error) {
    console.error('Failed to undo completion:', error);
    sendInternalError(res, error, 'Failed to undo completion');
  }
});

/**
 * Get completion history for a habit
 * GET /api/habits/:habitId/completions?limit=30
 */
app.get('/api/habits/:habitId/completions', async (req, res) => {
  const { habitId } = req.params;
  const { limit } = req.query;

  try {
    let query = supabase
      .from('habit_completions')
      .select('*')
      .eq('habit_id', habitId)
      .order('completion_date', { ascending: false });

    if (limit) {
      query = query.limit(parseInt(limit, 10));
    }

    const { data: completions, error } = await query;
    if (error) throw error;

    res.json({ completions: completions || [] });
  } catch (error) {
    console.error('Failed to fetch completions:', error);
    sendInternalError(res, error, 'Failed to fetch completions');
  }
});

/**
 * Get habits due for a specific date with completion status
 * GET /api/habits/daily-checkin/:date
 */
app.get('/api/habits/daily-checkin/:date', async (req, res) => {
  const { date } = req.params;

  try {
    // Get all active habits
    const { data: habits, error: habitsError } = await supabase
      .from('habits')
      .select('*, habit_streaks (*)')
      .eq('status', 'active')
      .order('sort_order');

    if (habitsError) throw habitsError;

    // Get completions for the specified date
    const { data: completions, error: completionsError } = await supabase
      .from('habit_completions')
      .select('habit_id')
      .eq('completion_date', date);

    if (completionsError) throw completionsError;

    const completedHabitIds = new Set((completions || []).map(c => c.habit_id));

    // Enrich habits with completion status
    const enrichedHabits = (habits || []).map(habit => ({
      ...habit,
      completed_today: completedHabitIds.has(habit.id),
      current_streak: habit.habit_streaks[0]?.current_streak || 0,
      habit_streaks: undefined,
    }));

    res.json({ habits: enrichedHabits, date });
  } catch (error) {
    console.error('Failed to fetch daily check-in:', error);
    sendInternalError(res, error, 'Failed to fetch daily check-in');
  }
});

/**
 * Bulk complete multiple habits
 * POST /api/habits/daily-checkin/bulk
 */
app.post('/api/habits/daily-checkin/bulk', async (req, res) => {
  const { completions } = req.body;

  if (!Array.isArray(completions) || completions.length === 0) {
    return res.status(400).json({ error: 'Completions array is required' });
  }

  const today = new Date().toISOString().split('T')[0];
  const results = [];
  const errors = [];

  try {
    for (const completion of completions) {
      const { habit_id, mood, notes } = completion;

      try {
        const { data, error } = await supabase
          .from('habit_completions')
          .insert({
            habit_id,
            completion_date: today,
            completed_at: new Date().toISOString(),
            mood: mood || null,
            notes: notes?.trim() || null,
          })
          .select()
          .single();

        if (error && error.code !== '23505') throw error; // Ignore duplicate errors

        if (!error) {
          await updateHabitStreakCache(habit_id);
          results.push({ habit_id, success: true });
        }
      } catch (err) {
        errors.push({ habit_id, error: err.message });
      }
    }

    res.json({
      message: 'Bulk completion processed',
      results,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('Failed to process bulk completion:', error);
    sendInternalError(res, error, 'Failed to process bulk completion');
  }
});

/**
 * Get habit statistics overview
 * GET /api/habits/stats/overview
 */
app.get('/api/habits/stats/overview', async (req, res) => {
  try {
    // Get all active habits
    const { data: habits, error: habitsError } = await supabase
      .from('habits')
      .select('id')
      .eq('status', 'active');

    if (habitsError) throw habitsError;

    const activeHabitsCount = habits?.length || 0;

    // Get today's completions
    const today = new Date().toISOString().split('T')[0];
    const { data: todayCompletions, error: completionsError } = await supabase
      .from('habit_completions')
      .select('habit_id')
      .eq('completion_date', today);

    if (completionsError) throw completionsError;

    const todayCompletionRate = activeHabitsCount > 0
      ? Math.round(((todayCompletions?.length || 0) / activeHabitsCount) * 100)
      : 0;

    // Get current streaks
    const { data: streaks, error: streaksError } = await supabase
      .from('habit_streaks')
      .select('current_streak, habit_id')
      .order('current_streak', { ascending: false });

    if (streaksError) throw streaksError;

    const activeStreaks = (streaks || []).filter(s => s.current_streak > 0).length;

    res.json({
      active_habits: activeHabitsCount,
      today_completion_count: todayCompletions?.length || 0,
      today_completion_rate: todayCompletionRate,
      active_streaks: activeStreaks,
    });
  } catch (error) {
    console.error('Failed to fetch overview stats:', error);
    sendInternalError(res, error, 'Failed to fetch overview stats');
  }
});

// ========================================
// HEALTH DATA API ENDPOINTS
// ========================================

/**
 * Import health data from Apple Health export
 * POST /api/health/import
 * Body: { healthData: [ { type, date, time, value, unit, metadata } ] }
 */
app.post('/api/health/import', async (req, res) => {
  const { healthData } = req.body;

  try {
    if (!healthData || !Array.isArray(healthData)) {
      return res.status(400).json({ error: 'Invalid health data format - expected array' });
    }

    if (healthData.length === 0) {
      return res.status(400).json({ error: 'No health data provided' });
    }

    // Transform and validate records
    const records = healthData.map(record => {
      // Validate required fields
      if (!record.type || !record.date || !record.value || !record.unit) {
        throw new Error('Invalid record: missing required fields (type, date, value, unit)');
      }

      return {
        data_type: record.type,
        recorded_date: new Date(record.date).toISOString().split('T')[0],
        recorded_at: record.time ? new Date(record.time).toISOString() : new Date(record.date).toISOString(),
        value: parseFloat(record.value),
        unit: record.unit,
        additional_data: record.metadata || null,
        source: 'apple_health'
      };
    });

    // Batch insert (upsert to handle duplicates)
    const { data, error } = await supabase
      .from('health_data')
      .upsert(records, {
        onConflict: 'id', // Will insert new records, ignore conflicts
        ignoreDuplicates: false
      })
      .select();

    if (error) throw error;

    res.json({
      imported: data?.length || 0,
      records: data,
      message: `Successfully imported ${data?.length || 0} health records`
    });
  } catch (error) {
    console.error('Failed to import health data:', error);
    sendInternalError(res, error, 'Failed to import health data');
  }
});

/**
 * Get daily health summary for a specific date
 * GET /api/health/daily?date=2024-01-15
 */
app.get('/api/health/daily', async (req, res) => {
  const { date } = req.query;
  const targetDate = date || new Date().toISOString().split('T')[0];

  try {
    const { data, error } = await supabase
      .from('health_data')
      .select('*')
      .eq('recorded_date', targetDate)
      .order('recorded_at', { ascending: false });

    if (error) throw error;

    // Helper functions for aggregation
    const calculateAvg = (records) => {
      if (!records || records.length === 0) return 0;
      const sum = records.reduce((acc, r) => acc + parseFloat(r.value), 0);
      return Math.round(sum / records.length);
    };

    const calculateMin = (records) => {
      if (!records || records.length === 0) return 0;
      return Math.min(...records.map(r => parseFloat(r.value)));
    };

    const calculateMax = (records) => {
      if (!records || records.length === 0) return 0;
      return Math.max(...records.map(r => parseFloat(r.value)));
    };

    // Aggregate by type
    const summary = {
      date: targetDate,
      steps: data.find(d => d.data_type === 'steps')?.value || 0,
      sleep: data.find(d => d.data_type === 'sleep')?.value || 0,
      workouts: data.filter(d => d.data_type === 'workout'),
      heartRate: {
        avg: calculateAvg(data.filter(d => d.data_type === 'heart_rate')),
        min: calculateMin(data.filter(d => d.data_type === 'heart_rate')),
        max: calculateMax(data.filter(d => d.data_type === 'heart_rate'))
      },
      calories: data.find(d => d.data_type === 'calories')?.value || 0
    };

    res.json(summary);
  } catch (error) {
    console.error('Failed to get daily health data:', error);
    sendInternalError(res, error, 'Failed to get daily health data');
  }
});

/**
 * Get health stats by type (last N days)
 * GET /api/health/stats/:type?days=30
 */
app.get('/api/health/stats/:type', async (req, res) => {
  const { type } = req.params;
  const { days = 30 } = req.query;

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - parseInt(days));

  try {
    const { data, error } = await supabase
      .from('health_data')
      .select('recorded_date, value')
      .eq('data_type', type)
      .gte('recorded_date', startDate.toISOString().split('T')[0])
      .order('recorded_date', { ascending: true });

    if (error) throw error;

    const total = data.reduce((sum, d) => sum + parseFloat(d.value), 0);
    const average = data.length > 0 ? total / data.length : 0;

    res.json({
      type,
      days: data,
      average: Math.round(average),
      total: Math.round(total),
      count: data.length
    });
  } catch (error) {
    console.error('Failed to get health stats:', error);
    sendInternalError(res, error, 'Failed to get health stats');
  }
});

/**
 * Get all metrics for today
 * GET /api/health/today
 */
app.get('/api/health/today', async (req, res) => {
  const today = new Date().toISOString().split('T')[0];

  try {
    const { data, error } = await supabase
      .from('health_data')
      .select('*')
      .eq('recorded_date', today)
      .order('recorded_at', { ascending: false });

    if (error) throw error;

    // Find the most recent import timestamp
    const lastSync = data.length > 0
      ? data.reduce((latest, record) => {
          const importTime = new Date(record.imported_at);
          return importTime > latest ? importTime : latest;
        }, new Date(0))
      : null;

    res.json({
      steps: data.find(d => d.data_type === 'steps')?.value || 0,
      sleep: data.find(d => d.data_type === 'sleep')?.value || 0,
      workouts: data.filter(d => d.data_type === 'workout'),
      heartRate: data.find(d => d.data_type === 'heart_rate')?.value || 0,
      calories: data.find(d => d.data_type === 'calories')?.value || 0,
      lastSync: lastSync ? lastSync.toISOString() : null
    });
  } catch (error) {
    console.error('Failed to get today\'s health data:', error);
    sendInternalError(res, error, 'Failed to get today\'s health data');
  }
});

// Import and start cron jobs
import './cronJobs.js';

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Claude Chat API server running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🎯 Optimus AI Task Curator endpoints ready`);
  console.log(`📊 Time Summary generation ready`);
  console.log(`✅ Habit Tracking endpoints ready`);
});

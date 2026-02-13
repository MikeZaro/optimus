/**
 * ========================================
 * Bottleneck Detector
 * ========================================
 * AI-powered detection of productivity barriers
 * Analyzes daily inputs, chat messages, and task patterns
 */

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Bottleneck categories (from spec)
 */
const BOTTLENECK_TYPES = {
  TIME_MANAGEMENT: 'time_management',
  FOLLOW_UP_CONSISTENCY: 'follow_up_consistency',
  TECHNICAL_SKILLS: 'technical_skills',
  DECISION_PARALYSIS: 'decision_paralysis',
  ENERGY_MOTIVATION: 'energy_motivation',
  PRIORITIZATION: 'prioritization',
};

/**
 * Main function to detect bottlenecks for a goal
 */
export async function detectBottlenecks(goalId) {
  console.log(`🔍 Detecting bottlenecks for goal: ${goalId}`);

  try {
    // Fetch goal details
    const { data: goal, error: goalError } = await supabase
      .from('goals')
      .select('*')
      .eq('id', goalId)
      .single();

    if (goalError) throw goalError;
    if (!goal) {
      throw new Error('Goal not found');
    }

    // Fetch context data
    const data = await fetchBottleneckContext(goalId, goal.area);

    // Check if there's enough data to analyze
    if (!hasEnoughDataForAnalysis(data)) {
      console.log(`⚠️ Not enough data to detect bottlenecks for goal: ${goal.title}`);
      return null;
    }

    // Build AI prompt
    const prompt = buildBottleneckPrompt(goal, data);

    // Call Claude API
    const response = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    });

    // Parse JSON response
    const result = JSON.parse(response.content[0].text);

    // Check if a bottleneck was actually detected
    if (!result.bottleneck_type || result.severity < 3) {
      console.log(`✅ No significant bottleneck detected for: ${goal.title}`);
      return null;
    }

    // Check for existing unresolved bottleneck of same type
    const { data: existingBottleneck } = await supabase
      .from('bottlenecks')
      .select('*')
      .eq('goal_id', goalId)
      .eq('bottleneck_type', result.bottleneck_type)
      .is('resolved_at', null)
      .single();

    if (existingBottleneck) {
      const daysPersisted = Math.floor(
        (Date.now() - new Date(existingBottleneck.detected_at).getTime()) / (1000 * 60 * 60 * 24)
      );
      const isPersistent = daysPersisted >= 30;
      const escalationNote = isPersistent
        ? 'This bottleneck has persisted for over 30 days. Consider external support (coach, mentor, accountability partner, or structured program).'
        : '';
      const nextDescription = escalationNote
        ? `${result.description} ${escalationNote}`.trim()
        : result.description;
      const nextSeverity = isPersistent
        ? Math.max(result.severity, existingBottleneck.severity, 8)
        : result.severity;

      if (Math.abs(existingBottleneck.severity - nextSeverity) >= 2 || isPersistent) {
        await supabase
          .from('bottlenecks')
          .update({
            severity: nextSeverity,
            description: nextDescription,
          })
          .eq('id', existingBottleneck.id);

        if (isPersistent) {
          console.warn(`Persistent bottleneck escalation for goal ${goalId}: ${result.bottleneck_type}`);
        } else {
          console.log(`Updated existing bottleneck severity: ${result.bottleneck_type}`);
        }

        return { ...existingBottleneck, severity: nextSeverity, description: nextDescription };
      }

      console.log(`Bottleneck already tracked: ${result.bottleneck_type}`);
      return existingBottleneck;
    }
    // Save new bottleneck to database
    const { data: bottleneck, error: insertError } = await supabase
      .from('bottlenecks')
      .insert({
        area: goal.area,
        goal_id: goalId,
        bottleneck_type: result.bottleneck_type,
        severity: result.severity,
        description: result.description,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    console.log(`🚨 New bottleneck detected: ${result.bottleneck_type} (severity: ${result.severity}/10)`);
    return bottleneck;

  } catch (error) {
    console.error('Bottleneck detection error:', error);
    throw error;
  }
}

/**
 * Fetch all context data needed for bottleneck detection
 */
async function fetchBottleneckContext(goalId, area) {
  // Time windows
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Daily inputs (last 7 days)
  const { data: dailyInputs } = await supabase
    .from('daily_inputs')
    .select('*')
    .gte('created_at', sevenDaysAgo.toISOString())
    .order('created_at', { ascending: false })
    .limit(10);

  // Chat messages linked to this goal (last 7 days)
  const { data: chatMessages } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('goal_id', goalId)
    .gte('created_at', sevenDaysAgo.toISOString())
    .order('created_at', { ascending: false })
    .limit(20);

  // Task patterns (last 30 days)
  const { data: completedTasks } = await supabase
    .from('tasks')
    .select('*')
    .eq('goal_id', goalId)
    .gte('created_at', thirtyDaysAgo.toISOString())
    .not('completed_at', 'is', null);

  const { data: skippedTasks } = await supabase
    .from('tasks')
    .select('*')
    .eq('goal_id', goalId)
    .gte('created_at', thirtyDaysAgo.toISOString())
    .not('skipped_at', 'is', null);

  // Calculate completion rate
  const totalTasks = (completedTasks?.length || 0) + (skippedTasks?.length || 0);
  const completionRate = totalTasks > 0
    ? ((completedTasks?.length || 0) / totalTasks * 100).toFixed(1)
    : 0;

  return {
    dailyInputs: dailyInputs || [],
    chatMessages: chatMessages || [],
    completedTasks: completedTasks || [],
    skippedTasks: skippedTasks || [],
    completionRate,
  };
}

/**
 * Check if there's enough data for meaningful analysis
 */
function hasEnoughDataForAnalysis(data) {
  // Need at least some task activity or communication
  const hasTaskActivity = (data.completedTasks.length + data.skippedTasks.length) >= 3;
  const hasCommunication = data.dailyInputs.length >= 2 || data.chatMessages.length >= 3;

  return hasTaskActivity || hasCommunication;
}

/**
 * Build AI prompt for bottleneck detection
 */
function buildBottleneckPrompt(goal, data) {
  // Extract task types
  const completedTypes = extractTaskTypes(data.completedTasks);
  const skippedTypes = extractTaskTypes(data.skippedTasks);

  // Extract user messages from chat
  const userMessages = data.chatMessages
    .filter(m => m.role === 'user')
    .map(m => m.content);

  const prompt = `Analyze the following user data to identify productivity bottlenecks:

**Current Goal:** ${goal.title} (${goal.area} area)

**Daily Inputs (last 7 days):**
${data.dailyInputs.map(d => `- "${d.response_text}"`).join('\n') || 'None'}

**Chat Messages (last 7 days):**
${userMessages.map(m => `- "${m}"`).join('\n') || 'None'}

**Task Patterns (last 30 days):**
- Completed: ${data.completedTasks.length} tasks
  ${completedTypes.length > 0 ? `Types: ${completedTypes.join(', ')}` : ''}
- Skipped: ${data.skippedTasks.length} tasks
  ${skippedTypes.length > 0 ? `Types: ${skippedTypes.join(', ')}` : ''}
- Completion rate: ${data.completionRate}%

**Your Task:**
Identify what is blocking progress toward this goal. Be specific about the bottleneck.

**Bottleneck Types:**
- time_management: Inconsistent completion, delays
- follow_up_consistency: Tasks started but not finished
- technical_skills: Avoiding tech-heavy tasks
- decision_paralysis: Skipping planning/strategy tasks
- energy_motivation: Personal well-being tasks neglected
- prioritization: Completing low-value tasks, skipping high-value

**Severity Scoring (1-10):**
- 1-3: Minor friction
- 4-6: Moderate blocker
- 7-8: Major bottleneck
- 9-10: Complete blockage

Return JSON only:
{
  "bottleneck_type": "one of the types above",
  "severity": integer between 1-10,
  "description": "specific explanation of what's blocking progress",
  "evidence": ["data point 1", "data point 2"]
}

If NO significant bottleneck exists, return:
{
  "bottleneck_type": null,
  "severity": 0,
  "description": "No significant bottleneck detected",
  "evidence": []
}`;

  return prompt;
}

/**
 * Extract task types from task list (simple keyword extraction)
 */
function extractTaskTypes(tasks) {
  const types = {};

  tasks.forEach(task => {
    const words = task.content.toLowerCase().split(/\s+/);
    const firstWord = words[0]; // First word is often the action verb

    if (firstWord && firstWord.length > 2) {
      types[firstWord] = (types[firstWord] || 0) + 1;
    }
  });

  return Object.entries(types)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word, count]) => `${word} (${count})`);}

/**
 * Mark a bottleneck as resolved
 */
export async function resolveBottleneck(bottleneckId) {
  const { error } = await supabase
    .from('bottlenecks')
    .update({
      resolved_at: new Date().toISOString(),
    })
    .eq('id', bottleneckId);

  if (error) throw error;

  console.log(`✅ Bottleneck resolved: ${bottleneckId}`);
  return true;
}

/**
 * Get all unresolved bottlenecks for a goal
 */
export async function getUnresolvedBottlenecks(goalId) {
  const { data, error } = await supabase
    .from('bottlenecks')
    .select('*')
    .eq('goal_id', goalId)
    .is('resolved_at', null)
    .order('severity', { ascending: false });

  if (error) throw error;

  return data || [];
}


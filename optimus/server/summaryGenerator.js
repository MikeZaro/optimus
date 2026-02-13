/**
 * ========================================
 * Time Summary Generator
 * ========================================
 * Generates AI-powered rolling summaries of user activity
 * across different timeframes (yesterday, week, month, etc.)
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

// Token limits per timeframe (as specified in the plan)
const TOKEN_LIMITS = {
  yesterday: 500,
  week: 750,
  month: 1000,
  '3month': 1500,
  '6month': 1500,
  year: 1500,
};

/**
 * Main function to generate summary for a timeframe
 */
export async function generateSummary(timeframe) {
  console.log(`📊 Generating ${timeframe} summary...`);

  try {
    // Fetch data for the timeframe
    const data = await fetchDataForTimeframe(timeframe);

    // Check if there's enough data to summarize
    if (!hasEnoughData(data)) {
      console.log(`⚠️ Not enough data for ${timeframe} summary`);
      return {
        timeframe,
        summary_text: `No significant activity during this ${timeframe}.`,
        patterns_identified: {},
        key_breakthroughs: [],
      };
    }

    // Build AI prompt
    const prompt = buildSummaryPrompt(timeframe, data);

    // Call Claude API
    const response = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: TOKEN_LIMITS[timeframe] + 200, // Extra for JSON structure
      messages: [{ role: 'user', content: prompt }],
    });

    // Parse JSON response
    const result = JSON.parse(response.content[0].text);

    // Save to database
    const { error } = await supabase
      .from('time_summaries')
      .upsert({
        timeframe: timeframe,
        summary_text: result.summary_text,
        patterns_identified: result.patterns_identified,
        key_breakthroughs: result.key_breakthroughs,
        last_updated: new Date().toISOString(),
      }, {
        onConflict: 'user_id,timeframe'
      });

    if (error) {
      console.error('Error saving summary:', error);
      throw error;
    }

    console.log(`✅ ${timeframe} summary generated successfully`);
    return result;

  } catch (error) {
    console.error(`Error generating ${timeframe} summary:`, error);
    throw error;
  }
}

/**
 * Fetch all relevant data for a timeframe
 */
async function fetchDataForTimeframe(timeframe) {
  const startDate = getStartDate(timeframe);

  // Fetch daily inputs
  const { data: dailyInputs } = await supabase
    .from('daily_inputs')
    .select('*')
    .gte('created_at', startDate.toISOString())
    .order('created_at', { ascending: true });

  // Fetch completed tasks
  const { data: completedTasks } = await supabase
    .from('tasks')
    .select('*')
    .gte('completed_at', startDate.toISOString())
    .not('completed_at', 'is', null);

  // Fetch skipped tasks
  const { data: skippedTasks } = await supabase
    .from('tasks')
    .select('*')
    .gte('skipped_at', startDate.toISOString())
    .not('skipped_at', 'is', null);

  // Fetch chat messages
  const { data: chatMessages } = await supabase
    .from('chat_messages')
    .select('*')
    .gte('created_at', startDate.toISOString())
    .order('created_at', { ascending: true });

  // Fetch goals created or completed in timeframe
  const { data: goals } = await supabase
    .from('goals')
    .select('*')
    .or(`created_at.gte.${startDate.toISOString()},completed_at.gte.${startDate.toISOString()}`);

  // Extract chat themes
  const chatThemes = extractChatThemes(chatMessages || []);

  // Get previous summary for rolling context (except for 'yesterday')
  let previousSummary = null;
  if (timeframe !== 'yesterday') {
    const prevTimeframe = getPreviousTimeframe(timeframe);
    const { data } = await supabase
      .from('time_summaries')
      .select('summary_text')
      .eq('timeframe', prevTimeframe)
      .maybeSingle();

    previousSummary = data?.summary_text;
  }

  return {
    dailyInputs: dailyInputs || [],
    completedTasks: completedTasks || [],
    skippedTasks: skippedTasks || [],
    chatMessages: chatMessages || [],
    chatThemes,
    goals: goals || [],
    previousSummary,
  };
}

/**
 * Check if there's enough data to generate a meaningful summary
 */
function hasEnoughData(data) {
  const totalItems =
    data.dailyInputs.length +
    data.completedTasks.length +
    data.skippedTasks.length +
    data.chatMessages.length +
    data.goals.length;

  return totalItems >= 3; // At least 3 data points
}

/**
 * Build the AI prompt for summary generation
 */
function buildSummaryPrompt(timeframe, data) {
  const prompt = `Analyze the following user data from ${timeframe}:

**Daily Inputs (${data.dailyInputs.length}):**
${data.dailyInputs.map(d => `- ${d.input_date}: "${d.response_text}"`).join('\n') || 'None'}

**Completed Tasks (${data.completedTasks.length}):**
${data.completedTasks.map(t => `- [${t.area}] ${t.content} (${t.source})`).join('\n') || 'None'}

**Skipped Tasks (${data.skippedTasks.length}):**
${data.skippedTasks.map(t => `- [${t.area}] ${t.content}`).join('\n') || 'None'}

**Chat Themes:**
${data.chatThemes.join(', ') || 'None'}

**Goals:**
${data.goals.map(g => `- [${g.area}] ${g.title} (${g.status})`).join('\n') || 'None'}

${data.previousSummary ? `**Previous ${getPreviousTimeframe(timeframe)} Summary:**\n${data.previousSummary}\n` : ''}

Generate a summary (max ${TOKEN_LIMITS[timeframe]} tokens) that:
1. Identifies recurring patterns (behaviors, preferences, bottlenecks)
2. Notes significant progress or setbacks
3. Highlights breakthrough moments
4. Preserves context about goal evolution
5. Drops one-off events and resolved issues

Format output as JSON:
{
  "summary_text": "narrative summary in 2-3 paragraphs",
  "patterns_identified": {
    "completion_preferences": ["pattern 1", "pattern 2"],
    "skip_patterns": ["pattern 1", "pattern 2"],
    "timing_patterns": ["pattern 1", "pattern 2"],
    "bottleneck_themes": ["theme 1", "theme 2"]
  },
  "key_breakthroughs": ["breakthrough 1", "breakthrough 2"]
}`;

  return prompt;
}

/**
 * Extract top themes from chat messages (simple keyword extraction)
 */
function extractChatThemes(messages) {
  const themes = {};

  messages.forEach(msg => {
    if (msg.role === 'user') {
      // Basic keyword extraction
      const words = msg.content.toLowerCase().split(/\s+/);
      words.forEach(word => {
        // Only meaningful words (length > 5)
        if (word.length > 5) {
          // Remove common words
          const commonWords = ['should', 'would', 'could', 'please', 'thanks', 'hello'];
          if (!commonWords.includes(word)) {
            themes[word] = (themes[word] || 0) + 1;
          }
        }
      });
    }
  });

  // Return top 10 themes
  return Object.entries(themes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word]) => word);
}

/**
 * Calculate start date for a timeframe
 */
function getStartDate(timeframe) {
  const now = new Date();
  const startDate = new Date(now);

  switch (timeframe) {
    case 'yesterday':
      startDate.setDate(startDate.getDate() - 1);
      startDate.setHours(0, 0, 0, 0);
      break;
    case 'week':
      startDate.setDate(startDate.getDate() - 7);
      break;
    case 'month':
      startDate.setMonth(startDate.getMonth() - 1);
      break;
    case '3month':
      startDate.setMonth(startDate.getMonth() - 3);
      break;
    case '6month':
      startDate.setMonth(startDate.getMonth() - 6);
      break;
    case 'year':
      startDate.setFullYear(startDate.getFullYear() - 1);
      break;
    default:
      throw new Error(`Unknown timeframe: ${timeframe}`);
  }

  return startDate;
}

/**
 * Get the previous timeframe (for rolling summaries)
 */
function getPreviousTimeframe(timeframe) {
  const map = {
    week: 'yesterday',
    month: 'week',
    '3month': 'month',
    '6month': '3month',
    year: '6month',
  };

  return map[timeframe] || null;
}

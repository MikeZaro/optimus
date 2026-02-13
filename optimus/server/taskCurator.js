/**
 * ========================================
 * AI Task Curator
 * ========================================
 * Intelligent task generation that learns from:
 * - Current limiting factors (prioritize removal)
 * - Time summaries (understand patterns)
 * - Task history (what worked, what didn't)
 * - Goal context (logical progression)
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

function normalizeTaskContent(content) {
  return (content || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const MULTI_DAY_PATTERNS = [
  /\bnext few days\b/i,
  /\bnext day\b/i,
  /\bnext week\b/i,
  /\bthis week\b/i,
  /\bthroughout the week\b/i,
  /\beach day\b/i,
  /\bdaily\b/i,
  /\bper day\b/i,
  /\bevery day\b/i,
  /\bfor \d+\s+days\b/i,
  /\bover \d+\s+days\b/i,
  /\bover the next\b/i,
  /\bthis month\b/i,
];

function isDuplicateTaskContent(content, forbiddenNormalizedSet) {
  return forbiddenNormalizedSet.has(normalizeTaskContent(content));
}

function hasMultiDayLanguage(content) {
  return MULTI_DAY_PATTERNS.some((pattern) => pattern.test(content || ''));
}

function isTaskContentValid(content, forbiddenNormalizedSet) {
  if (!content || !content.trim()) return false;
  if (isDuplicateTaskContent(content, forbiddenNormalizedSet)) return false;
  if (hasMultiDayLanguage(content)) return false;
  return true;
}

async function generateUniqueTaskResult(prompt, forbiddenNormalizedSet) {
  const maxAttempts = 3;
  let lastResult = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const attemptPrompt = attempt === 1
      ? prompt
      : `${prompt}\n\nIMPORTANT: Your last response repeated an existing task. Generate a DIFFERENT task with distinct wording and action.`;

    const response = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 800,
      messages: [{ role: 'user', content: attemptPrompt }],
    });

    const result = JSON.parse(response.content[0].text);
    lastResult = result;

    if (isTaskContentValid(result.content, forbiddenNormalizedSet)) {
      return result;
    }
  }

  return lastResult;
}

async function generateSingleReplacementTask(goal, area, context, sequencePosition, forbiddenTaskContents, forbiddenNormalizedSet) {
  const prompt = buildNextTaskPrompt(goal, area, context, sequencePosition, forbiddenTaskContents);
  const result = await generateUniqueTaskResult(prompt, forbiddenNormalizedSet);
  if (!result?.content || !isTaskContentValid(result.content, forbiddenNormalizedSet)) {
    return null;
  }
  return { content: result.content };
}

/**
 * Generate 3 initial tasks for a new goal
 */
export async function generateInitialTasks(goalId, area) {
  console.log(`🎯 Generating initial 3 tasks for goal: ${goalId}`);

  try {
    // Fetch goal details
    const { data: goal, error: goalError } = await supabase
      .from('goals')
      .select('*')
      .eq('id', goalId)
      .single();

    if (goalError) throw goalError;
    if (!goal) throw new Error('Goal not found');

    // Get context for task generation
    const context = await fetchCuratorContext(goalId, area);

    // Build AI prompt for initial tasks
    const prompt = buildInitialTasksPrompt(goal, area, context);

    // Call Claude API
    const response = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    });

    // Parse JSON response
    const result = JSON.parse(response.content[0].text);

    // Avoid duplicates against existing goal tasks
    const { data: existingGoalTasks } = await supabase
      .from('tasks')
      .select('content')
      .eq('goal_id', goalId);

    const forbiddenNormalizedSet = new Set(
      (existingGoalTasks || []).map((task) => normalizeTaskContent(task.content))
    );

    // Deduplicate model output and enforce today-only language.
    const uniqueTasks = [];
    for (const task of result.tasks || []) {
      const normalized = normalizeTaskContent(task.content);
      if (!normalized || forbiddenNormalizedSet.has(normalized)) continue;
      if (hasMultiDayLanguage(task.content)) continue;
      forbiddenNormalizedSet.add(normalized);
      uniqueTasks.push(task);
      if (uniqueTasks.length === 3) break;
    }

    // Fill missing tasks with single-task generation if needed.
    if (uniqueTasks.length < 3) {
      const forbiddenTaskContents = [
        ...(existingGoalTasks || []).map((task) => task.content),
        ...uniqueTasks.map((task) => task.content),
      ];

      while (uniqueTasks.length < 3) {
        const replacement = await generateSingleReplacementTask(
          goal,
          area,
          context,
          uniqueTasks.length + 1,
          forbiddenTaskContents,
          forbiddenNormalizedSet
        );
        if (!replacement) break;

        forbiddenTaskContents.push(replacement.content);
        forbiddenNormalizedSet.add(normalizeTaskContent(replacement.content));
        uniqueTasks.push(replacement);
      }
    }

    if (uniqueTasks.length === 0) {
      throw new Error('AI returned invalid initial tasks. Please retry.');
    }

    // Insert tasks into database
    const tasksToInsert = uniqueTasks.map((task, index) => ({
      goal_id: goalId,
      area: area,
      content: task.content,
      source: 'ai_curated',
      sequence_position: index + 1,
      presented_at: new Date().toISOString(),
    }));

    const { data: insertedTasks, error: insertError } = await supabase
      .from('tasks')
      .insert(tasksToInsert)
      .select();

    if (insertError) throw insertError;

    console.log(`✅ Generated ${insertedTasks.length} initial tasks for: ${goal.title}`);
    return insertedTasks;

  } catch (error) {
    console.error('Initial task generation error:', error);
    throw error;
  }
}

/**
 * Generate next single task after completion/skip
 */
export async function generateNextTask(goalId, area) {
  console.log(`🔄 Generating next task for goal: ${goalId}`);

  try {
    // Fetch goal details
    const { data: goal, error: goalError } = await supabase
      .from('goals')
      .select('*')
      .eq('id', goalId)
      .single();

    if (goalError) throw goalError;
    if (!goal) throw new Error('Goal not found');

    // Get context
    const context = await fetchCuratorContext(goalId, area);

    // Count existing tasks to determine sequence position
    const { data: existingTasks } = await supabase
      .from('tasks')
      .select('id')
      .eq('goal_id', goalId);

    const nextPosition = (existingTasks?.length || 0) + 1;

    const forbiddenTaskContents = [
      ...(context.openTasks || []).map((t) => t.content),
      ...(context.recentCompleted || []).map((t) => t.content),
      ...(context.recentSkipped || []).map((t) => t.content),
    ];
    const forbiddenNormalizedSet = new Set(
      forbiddenTaskContents.map((content) => normalizeTaskContent(content)).filter(Boolean)
    );

    // Build AI prompt for next task
    const prompt = buildNextTaskPrompt(
      goal,
      area,
      context,
      nextPosition,
      forbiddenTaskContents.slice(0, 25)
    );

    // Generate with duplicate protection and retries
    const result = await generateUniqueTaskResult(prompt, forbiddenNormalizedSet);
    if (!result?.content) {
      throw new Error('AI failed to generate next task content');
    }

    // Insert task into database
    const { data: newTask, error: insertError } = await supabase
      .from('tasks')
      .insert({
        goal_id: goalId,
        area: area,
        content: result.content,
        source: 'ai_curated',
        sequence_position: nextPosition,
        presented_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) throw insertError;

    console.log(`✅ Generated next task: "${newTask.content}"`);
    return newTask;

  } catch (error) {
    console.error('Next task generation error:', error);
    throw error;
  }
}

/**
 * Fetch all context data needed for intelligent task curation
 */
async function fetchCuratorContext(goalId, area) {
  // Fetch current bottleneck (highest severity, unresolved)
  const { data: bottlenecks } = await supabase
    .from('bottlenecks')
    .select('*')
    .eq('goal_id', goalId)
    .is('resolved_at', null)
    .order('severity', { ascending: false })
    .limit(1);

  const currentBottleneck = bottlenecks?.[0] || null;

  // Fetch time summaries for pattern context
  const { data: summaries } = await supabase
    .from('time_summaries')
    .select('*')
    .in('timeframe', ['yesterday', 'week', 'month'])
    .order('last_updated', { ascending: false });

  // Fetch recent completed tasks (last 10)
  const { data: recentCompleted } = await supabase
    .from('tasks')
    .select('content, completed_at')
    .eq('goal_id', goalId)
    .not('completed_at', 'is', null)
    .order('completed_at', { ascending: false })
    .limit(10);

  // Fetch recent skipped tasks (last 10)
  const { data: recentSkipped } = await supabase
    .from('tasks')
    .select('content, skipped_at')
    .eq('goal_id', goalId)
    .not('skipped_at', 'is', null)
    .order('skipped_at', { ascending: false })
    .limit(10);

  // Fetch currently open tasks to avoid generating duplicates
  const { data: openTasks } = await supabase
    .from('tasks')
    .select('content, presented_at')
    .eq('goal_id', goalId)
    .is('completed_at', null)
    .is('skipped_at', null)
    .order('presented_at', { ascending: false })
    .limit(20);

  // Calculate completion rate
  const totalRecent = (recentCompleted?.length || 0) + (recentSkipped?.length || 0);
  const completionRate = totalRecent > 0
    ? ((recentCompleted?.length || 0) / totalRecent * 100).toFixed(1)
    : 0;

  // Fetch historical patterns from completed goals in same area
  const { data: completedGoals } = await supabase
    .from('goals')
    .select('*')
    .eq('area', area)
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
    .limit(3);

  let historicalPatterns = null;
  if (completedGoals && completedGoals.length > 0) {
    // Get task types from most recent completed goal
    const { data: historicalTasks } = await supabase
      .from('tasks')
      .select('content, completed_at')
      .eq('goal_id', completedGoals[0].id)
      .not('completed_at', 'is', null)
      .limit(20);

    if (historicalTasks && historicalTasks.length > 0) {
      historicalPatterns = extractTaskPatterns(historicalTasks);
    }
  }

  return {
    currentBottleneck,
    summaries: summaries || [],
    recentCompleted: recentCompleted || [],
    recentSkipped: recentSkipped || [],
    openTasks: openTasks || [],
    completionRate,
    historicalPatterns,
  };
}

/**
 * Build AI prompt for initial 3 tasks
 */
function buildInitialTasksPrompt(goal, area, context) {
  const goalDescriptionSection = goal.description
    ? `**Goal Description (user context):** ${goal.description}`
    : '**Goal Description (user context):** None provided.';

  const bottleneckSection = context.currentBottleneck
    ? `**CRITICAL - Current Limiting Factor:**
- Type: ${context.currentBottleneck.bottleneck_type}
- Severity: ${context.currentBottleneck.severity}/10
- Description: ${context.currentBottleneck.description}

${getBottleneckStrategy(context.currentBottleneck.severity)}`
    : '**No Current Limiting Factor** - Follow logical task sequence for goal progression.';

  // Extract pattern data from summaries
  const patternData = context.summaries.length > 0 ? context.summaries[0].patterns_identified : null;

  const summarySection = context.summaries.length > 0
    ? `**User Patterns (from time summaries):**
${context.summaries.map(s => `- ${s.timeframe}: ${s.summary_text.substring(0, 150)}...`).join('\n')}

${patternData ? `**Learned Patterns:**
- Effective task types: ${patternData.completion_preferences?.slice(0, 5).join(', ') || 'None yet'}
- Avoided task types: ${patternData.skip_patterns?.slice(0, 3).join(', ') || 'None'}
- Best time to work: ${patternData.timing_patterns?.peakDay || 'Unknown'} ${patternData.timing_patterns?.peakHour ? `at ${patternData.timing_patterns.peakHour}:00` : ''}
- Preferred task structure: ${patternData.task_structure?.lengthCategory || 'Unknown'} (${patternData.task_structure?.averageWordCount || 0} words avg)
- Common successful sequences: ${patternData.sequence_patterns?.commonTwoStepSequences?.[0]?.sequence || 'None yet'}` : ''}`
    : '**No Pattern Data Yet** - This is a new user or area.';

  const historySection = context.recentCompleted.length > 0
    ? `**Recent Completed Tasks:**
${context.recentCompleted.map(t => `- ${t.content}`).join('\n')}

**Recent Skipped Tasks:**
${context.recentSkipped.length > 0 ? context.recentSkipped.map(t => `- ${t.content}`).join('\n') : 'None'}

**Completion Rate:** ${context.completionRate}%`
    : '**No Task History** - This is the first goal in this area.';

  const historicalSection = context.historicalPatterns
    ? `**Historical Success Patterns (from past completed goals):**
- Effective task types: ${context.historicalPatterns.effectiveTypes.join(', ')}
- Task structure that worked: ${context.historicalPatterns.structure}`
    : '**No Historical Data** - First goal in this area.';

  const prompt = `You are the Optimus AI Task Curator. Your job is to generate the first 3 tasks to help the user achieve their goal.

**Goal:** ${goal.title}
**Area:** ${area}
${goalDescriptionSection}

${bottleneckSection}

${summarySection}

${historySection}

${historicalSection}

**Your Mission:**
Generate 3 specific, actionable tasks that:
1. ${context.currentBottleneck && context.currentBottleneck.severity >= 7
    ? 'ALL focus on removing the bottleneck (tactical approach)'
    : context.currentBottleneck && context.currentBottleneck.severity >= 4
    ? '2 tasks address the bottleneck, 1 task advances goal sequence'
    : 'Follow logical progression toward the goal'}
2. Reflect the user's current roadmap position based on completed/skipped tasks (do not restart from step 1 if progress already exists)
3. Prioritize the most logical next step(s) from the current state of the goal
4. If the user is stuck, propose smaller, unblock-first steps before advanced steps
2. Build on successful patterns (avoid skipped task types)
3. Are appropriate scope (30-90 minutes of work each)
4. Have one clear outcome per task
5. Use action verbs (Research, Draft, Create, Schedule, Contact, etc.)
6. MUST be completable today in one focused session
7. MUST NOT use multi-day language like "next few days", "this week", "daily", "every day"
8. Must explicitly align with the goal description constraints and intent

**Task Guidelines:**
- Be specific and concrete (not vague or abstract)
- Include measurable outcomes when possible
- Consider user's past behavior and preferences
- Start with easier tasks to build momentum
- For bottleneck tasks, use this progression:
  → Skill-building (learn/research)
  → Simplified version (reduce scope)
  → Get support (find resources/help)

**Output Format (JSON only):**
{
  "tasks": [
    {
      "content": "Specific task description with clear outcome",
      "rationale": "Why this task now (1 sentence)"
    },
    {
      "content": "Second task description",
      "rationale": "Why this task now"
    },
    {
      "content": "Third task description",
      "rationale": "Why this task now"
    }
  ]
}`;

  return prompt;
}

/**
 * Build AI prompt for next single task
 */
function buildNextTaskPrompt(goal, area, context, sequencePosition, forbiddenTaskContents = []) {
  const goalDescriptionSection = goal.description
    ? `**Goal Description (user context):** ${goal.description}`
    : '**Goal Description (user context):** None provided.';

  const bottleneckSection = context.currentBottleneck
    ? `**Current Limiting Factor:**
- Type: ${context.currentBottleneck.bottleneck_type}
- Severity: ${context.currentBottleneck.severity}/10
- Description: ${context.currentBottleneck.description}

${getBottleneckStrategy(context.currentBottleneck.severity)}`
    : '**No Current Limiting Factor** - Continue logical sequence.';

  const recentActivity = `**Recent Activity:**
- Last completed: ${context.recentCompleted[0]?.content || 'None'}
- Last skipped: ${context.recentSkipped[0]?.content || 'None'}
- Completion rate: ${context.completionRate}%`;

  const forbiddenSection = forbiddenTaskContents.length > 0
    ? `**Do Not Repeat These Existing/Recent Tasks:**
${forbiddenTaskContents.map((content) => `- ${content}`).join('\n')}`
    : '';

  const prompt = `You are the Optimus AI Task Curator. Generate the next single task for this goal.

**Goal:** ${goal.title}
**Area:** ${area}
**Task Position:** #${sequencePosition}
${goalDescriptionSection}

${bottleneckSection}

${recentActivity}

${forbiddenSection}

**Your Mission:**
Generate 1 specific, actionable task that:
1. ${context.currentBottleneck && context.currentBottleneck.severity >= 7
    ? 'Focuses on removing the bottleneck'
    : context.currentBottleneck && context.currentBottleneck.severity >= 4
    ? 'Either addresses bottleneck OR advances goal (alternate for balance)'
    : 'Advances toward the goal logically'}
2. Must be the most logical next step on the user's roadmap given what is already completed/skipped
3. Must account for current progress stage (early, middle, or final stretch) and pick the right level of task
2. Builds on what was just completed
3. Avoids patterns of skipped tasks
4. MUST NOT repeat or paraphrase any task from the "Do Not Repeat" list
5. Takes 30-90 minutes and can be finished today
6. MUST NOT use multi-day language like "next few days", "this week", "daily", "every day"
7. Has one clear outcome
8. Must stay tightly aligned to the user's goal description

**Task Guidelines:**
- Be specific and concrete
- Use action verbs
- Include measurable outcome
- Consider what just worked/didn't work
- For bottleneck tasks: Skill-building → Simplified → Support

**Output Format (JSON only):**
{
  "content": "Specific task description with clear outcome",
  "rationale": "Why this task now (1 sentence)"
}`;

  return prompt;
}

/**
 * Get task strategy based on bottleneck severity
 */
function getBottleneckStrategy(severity) {
  if (!severity) {
    return 'Strategy: Follow logical task sequence for goal progression.';
  }

  if (severity >= 9) {
    return 'Strategy: URGENT - All 3 tasks must focus on bottleneck removal with tactical, concrete steps.';
  }

  if (severity >= 7) {
    return 'Strategy: MAJOR BLOCKER - All 3 tasks focus on bottleneck with skill-building → simplified → support progression.';
  }

  if (severity >= 4) {
    return 'Strategy: MODERATE BLOCKER - 2 tasks address bottleneck, 1 task advances goal sequence for balance.';
  }

  return 'Strategy: MINOR FRICTION - Follow standard goal sequence but keep bottleneck in mind.';
}

/**
 * Extract task patterns from historical tasks
 */
function extractTaskPatterns(tasks) {
  const types = {};
  const structures = [];

  tasks.forEach(task => {
    const words = task.content.toLowerCase().split(/\s+/);
    const firstWord = words[0];

    // Extract action verb (first word)
    if (firstWord && firstWord.length > 2) {
      types[firstWord] = (types[firstWord] || 0) + 1;
    }

    // Identify task structure
    if (task.content.includes(':')) {
      structures.push('uses_colon_structure');
    }
    if (task.content.match(/\d+/)) {
      structures.push('includes_numbers');
    }
    if (task.content.split(' ').length < 8) {
      structures.push('concise');
    }
  });

  // Get top 5 effective task types
  const effectiveTypes = Object.entries(types)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word]) => word);

  // Most common structure
  const structureCounts = {};
  structures.forEach(s => {
    structureCounts[s] = (structureCounts[s] || 0) + 1;
  });
  const structure = Object.entries(structureCounts)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || 'varied';

  return {
    effectiveTypes,
    structure,
  };
}

/**
 * ========================================
 * Pattern Analyzer
 * ========================================
 * Analyzes completed goals to extract patterns and learnings
 * that improve future task generation
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Analyze patterns from a completed goal
 * Called when goal is marked complete
 */
export async function analyzeGoalPatterns(goalId) {
  console.log(`📊 Analyzing patterns for completed goal: ${goalId}`);

  try {
    // Fetch goal details
    const { data: goal, error: goalError } = await supabase
      .from('goals')
      .select('*')
      .eq('id', goalId)
      .single();

    if (goalError) throw goalError;
    if (!goal) throw new Error('Goal not found');

    // Fetch all tasks for this goal
    const { data: allTasks } = await supabase
      .from('tasks')
      .select('*')
      .eq('goal_id', goalId)
      .order('created_at', { ascending: true });

    if (!allTasks || allTasks.length === 0) {
      console.log('No tasks to analyze');
      return null;
    }

    // Separate completed and skipped tasks
    const completed = allTasks.filter(t => t.completed_at);
    const skipped = allTasks.filter(t => t.skipped_at);

    // Calculate metrics
    const totalTasks = allTasks.length;
    const completionRate = (completed.length / totalTasks * 100).toFixed(1);

    // Extract patterns
    const patterns = {
      completionRate: parseFloat(completionRate),
      totalTasks,
      completedTasks: completed.length,
      skippedTasks: skipped.length,

      // Task type analysis
      effectiveTaskTypes: extractTaskTypes(completed),
      avoidedTaskTypes: extractTaskTypes(skipped),

      // Timing patterns
      timingPatterns: analyzeTimingPatterns(completed),

      // Task structure analysis
      taskStructure: analyzeTaskStructure(completed),

      // Sequence patterns
      sequencePatterns: analyzeSequencePatterns(allTasks),

      // Source analysis
      sourceEffectiveness: analyzeSourceEffectiveness(completed, skipped),
    };

    console.log(`✅ Pattern analysis complete for: ${goal.title}`);
    console.log(`   Completion rate: ${completionRate}%`);
    console.log(`   Effective types: ${patterns.effectiveTaskTypes.slice(0, 3).map(t => t.type).join(', ')}`);

    return patterns;

  } catch (error) {
    console.error('Pattern analysis error:', error);
    throw error;
  }
}

/**
 * Extract task types (action verbs) from tasks
 */
function extractTaskTypes(tasks) {
  const types = {};

  tasks.forEach(task => {
    // Extract first word (action verb)
    const words = task.content.toLowerCase().split(/\s+/);
    const firstWord = words[0];

    if (firstWord && firstWord.length > 2) {
      types[firstWord] = (types[firstWord] || 0) + 1;
    }

    // Also extract key action words from middle of task
    const actionWords = ['research', 'draft', 'create', 'schedule', 'contact',
                         'review', 'update', 'complete', 'write', 'plan',
                         'call', 'email', 'read', 'watch', 'practice'];

    words.forEach(word => {
      if (actionWords.includes(word) && word !== firstWord) {
        const key = `${word}_secondary`;
        types[key] = (types[key] || 0) + 1;
      }
    });
  });

  // Return top 10 types by frequency
  return Object.entries(types)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([type, count]) => ({
      type,
      count,
      percentage: (count / tasks.length * 100).toFixed(1)
    }));
}

/**
 * Analyze timing patterns (when tasks get completed)
 */
function analyzeTimingPatterns(completedTasks) {
  const hourCounts = new Array(24).fill(0);
  const dayOfWeekCounts = new Array(7).fill(0);

  completedTasks.forEach(task => {
    if (task.completed_at) {
      const date = new Date(task.completed_at);
      const hour = date.getHours();
      const dayOfWeek = date.getDay(); // 0 = Sunday, 6 = Saturday

      hourCounts[hour]++;
      dayOfWeekCounts[dayOfWeek]++;
    }
  });

  // Find peak hour
  const peakHour = hourCounts.indexOf(Math.max(...hourCounts));

  // Find peak day
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const peakDay = dayNames[dayOfWeekCounts.indexOf(Math.max(...dayOfWeekCounts))];

  // Calculate time-of-day distribution
  const morning = hourCounts.slice(6, 12).reduce((a, b) => a + b, 0);   // 6 AM - 12 PM
  const afternoon = hourCounts.slice(12, 18).reduce((a, b) => a + b, 0); // 12 PM - 6 PM
  const evening = hourCounts.slice(18, 24).reduce((a, b) => a + b, 0);   // 6 PM - 12 AM
  const total = morning + afternoon + evening;

  return {
    peakHour,
    peakDay,
    timeOfDayDistribution: total > 0 ? {
      morning: (morning / total * 100).toFixed(1),
      afternoon: (afternoon / total * 100).toFixed(1),
      evening: (evening / total * 100).toFixed(1),
    } : null,
  };
}

/**
 * Analyze task structure patterns
 */
function analyzeTaskStructure(tasks) {
  let totalLength = 0;
  let hasColon = 0;
  let hasNumbers = 0;
  let hasParentheses = 0;
  let hasQuestionMark = 0;

  tasks.forEach(task => {
    const words = task.content.split(/\s+/);
    totalLength += words.length;

    if (task.content.includes(':')) hasColon++;
    if (task.content.match(/\d+/)) hasNumbers++;
    if (task.content.includes('(')) hasParentheses++;
    if (task.content.includes('?')) hasQuestionMark++;
  });

  const avgLength = Math.round(totalLength / tasks.length);

  return {
    averageWordCount: avgLength,
    lengthCategory: avgLength < 6 ? 'concise' : avgLength < 12 ? 'moderate' : 'detailed',
    usesColon: (hasColon / tasks.length * 100).toFixed(1),
    includesNumbers: (hasNumbers / tasks.length * 100).toFixed(1),
    usesParentheses: (hasParentheses / tasks.length * 100).toFixed(1),
    includesQuestions: (hasQuestionMark / tasks.length * 100).toFixed(1),
  };
}

/**
 * Analyze sequence patterns (task order that works)
 */
function analyzeSequencePatterns(allTasks) {
  const sequences = [];
  let currentSequence = [];

  // Track sequences of completed tasks
  allTasks.forEach(task => {
    if (task.completed_at) {
      const firstWord = task.content.toLowerCase().split(/\s+/)[0];
      currentSequence.push(firstWord);
    } else if (task.skipped_at && currentSequence.length > 0) {
      // End of sequence
      if (currentSequence.length >= 2) {
        sequences.push([...currentSequence]);
      }
      currentSequence = [];
    }
  });

  // Add final sequence
  if (currentSequence.length >= 2) {
    sequences.push(currentSequence);
  }

  // Find most common 2-task and 3-task sequences
  const twoTaskSequences = {};
  const threeTaskSequences = {};

  sequences.forEach(seq => {
    // 2-task sequences
    for (let i = 0; i < seq.length - 1; i++) {
      const key = `${seq[i]} → ${seq[i + 1]}`;
      twoTaskSequences[key] = (twoTaskSequences[key] || 0) + 1;
    }

    // 3-task sequences
    for (let i = 0; i < seq.length - 2; i++) {
      const key = `${seq[i]} → ${seq[i + 1]} → ${seq[i + 2]}`;
      threeTaskSequences[key] = (threeTaskSequences[key] || 0) + 1;
    }
  });

  return {
    commonTwoStepSequences: Object.entries(twoTaskSequences)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([seq, count]) => ({ sequence: seq, occurrences: count })),

    commonThreeStepSequences: Object.entries(threeTaskSequences)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([seq, count]) => ({ sequence: seq, occurrences: count })),
  };
}

/**
 * Analyze effectiveness by source (AI vs user-added)
 */
function analyzeSourceEffectiveness(completedTasks, skippedTasks) {
  const aiCompleted = completedTasks.filter(t => t.source === 'ai_curated').length;
  const aiSkipped = skippedTasks.filter(t => t.source === 'ai_curated').length;
  const userCompleted = completedTasks.filter(t => t.source === 'user_added').length;
  const userSkipped = skippedTasks.filter(t => t.source === 'user_added').length;

  const aiTotal = aiCompleted + aiSkipped;
  const userTotal = userCompleted + userSkipped;

  return {
    aiCurated: aiTotal > 0 ? {
      completionRate: (aiCompleted / aiTotal * 100).toFixed(1),
      completed: aiCompleted,
      skipped: aiSkipped,
    } : null,
    userAdded: userTotal > 0 ? {
      completionRate: (userCompleted / userTotal * 100).toFixed(1),
      completed: userCompleted,
      skipped: userSkipped,
    } : null,
  };
}

/**
 * Update time summaries with new patterns from completed goal
 */
export async function updateTimeSummaryPatterns(timeframe, goalId) {
  console.log(`🔄 Updating ${timeframe} summary with patterns from goal: ${goalId}`);

  try {
    // Get patterns from completed goal
    const goalPatterns = await analyzeGoalPatterns(goalId);
    if (!goalPatterns) return;

    // Fetch current summary
    const { data: summary } = await supabase
      .from('time_summaries')
      .select('*')
      .eq('timeframe', timeframe)
      .maybeSingle();

    if (!summary) {
      console.log(`No ${timeframe} summary exists yet`);
      return;
    }

    // Merge patterns with existing
    const currentPatterns = summary.patterns_identified || {};

    const updatedPatterns = {
      completion_preferences: mergeArrays(
        currentPatterns.completion_preferences || [],
        goalPatterns.effectiveTaskTypes.map(t => t.type)
      ),
      skip_patterns: mergeArrays(
        currentPatterns.skip_patterns || [],
        goalPatterns.avoidedTaskTypes.map(t => t.type)
      ),
      timing_patterns: {
        ...currentPatterns.timing_patterns,
        peakHour: goalPatterns.timingPatterns.peakHour,
        peakDay: goalPatterns.timingPatterns.peakDay,
        timeOfDayDistribution: goalPatterns.timingPatterns.timeOfDayDistribution,
      },
      bottleneck_themes: currentPatterns.bottleneck_themes || [],
      task_structure: goalPatterns.taskStructure,
      sequence_patterns: goalPatterns.sequencePatterns,
    };

    // Update summary
    await supabase
      .from('time_summaries')
      .update({
        patterns_identified: updatedPatterns,
        last_updated: new Date().toISOString(),
      })
      .eq('id', summary.id);

    console.log(`✅ Updated ${timeframe} summary with new patterns`);

  } catch (error) {
    console.error('Error updating time summary patterns:', error);
    throw error;
  }
}

/**
 * Helper: Merge arrays, keeping unique values and top 10
 */
function mergeArrays(arr1, arr2) {
  const combined = [...arr1, ...arr2];
  const unique = [...new Set(combined)];
  return unique.slice(0, 10);
}

/**
 * Get effectiveness metrics for a specific task type
 */
export async function getTaskTypeEffectiveness(area, taskType) {
  console.log(`📈 Analyzing effectiveness of "${taskType}" tasks in ${area}`);

  try {
    // Get all goals in this area
    const { data: goals } = await supabase
      .from('goals')
      .select('id')
      .eq('area', area)
      .eq('status', 'completed');

    if (!goals || goals.length === 0) {
      return { noData: true };
    }

    const goalIds = goals.map(g => g.id);

    // Get all tasks starting with this type
    const { data: tasks } = await supabase
      .from('tasks')
      .select('*')
      .in('goal_id', goalIds);

    const matchingTasks = tasks.filter(t =>
      t.content.toLowerCase().startsWith(taskType.toLowerCase())
    );

    const completed = matchingTasks.filter(t => t.completed_at).length;
    const skipped = matchingTasks.filter(t => t.skipped_at).length;
    const total = completed + skipped;

    if (total === 0) {
      return { noData: true };
    }

    return {
      taskType,
      area,
      completionRate: (completed / total * 100).toFixed(1),
      completed,
      skipped,
      total,
      recommendation: completed / total >= 0.7 ? 'highly_effective' :
                      completed / total >= 0.5 ? 'moderately_effective' :
                      'less_effective',
    };

  } catch (error) {
    console.error('Error analyzing task type effectiveness:', error);
    throw error;
  }
}

/**
 * ========================================
 * Habit Streak Calculator
 * ========================================
 * Calculates current/longest streaks and completion rates for habits
 * Handles different frequency types (daily, weekly, custom)
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Calculate comprehensive streak statistics for a habit
 * @param {string} habitId - UUID of the habit
 * @param {Date} asOfDate - Date to calculate streak as of (defaults to today)
 * @returns {Object} Streak statistics
 */
export async function calculateStreak(habitId, asOfDate = new Date()) {
  try {
    // 1. Fetch habit with frequency config
    const { data: habit, error: habitError } = await supabase
      .from('habits')
      .select('*')
      .eq('id', habitId)
      .single();

    if (habitError) throw habitError;
    if (!habit) throw new Error(`Habit ${habitId} not found`);

    // 2. Fetch all completions in descending order
    const { data: completions, error: completionsError } = await supabase
      .from('habit_completions')
      .select('completion_date, completed_at')
      .eq('habit_id', habitId)
      .order('completion_date', { ascending: false });

    if (completionsError) throw completionsError;

    const completionDates = (completions || []).map(c => c.completion_date);

    // 3. Calculate current streak
    const currentStreak = calculateCurrentStreak(habit, completionDates, asOfDate);

    // 4. Calculate longest streak ever
    const longestStreak = calculateLongestStreak(habit, completionDates);

    // 5. Calculate completion rates
    const rates = calculateCompletionRates(habit, completionDates, asOfDate);

    // 6. Determine last completed date
    const lastCompletedDate = completionDates.length > 0 ? completionDates[0] : null;

    return {
      current_streak: currentStreak,
      longest_streak: longestStreak,
      total_completions: completionDates.length,
      completion_rate_7day: rates.rate7d,
      completion_rate_30day: rates.rate30d,
      completion_rate_all_time: rates.rateAllTime,
      last_completed_date: lastCompletedDate,
      last_calculated_at: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Error calculating streak:', error);
    throw error;
  }
}

/**
 * Calculate current active streak
 */
function calculateCurrentStreak(habit, completionDates, asOfDate) {
  let streak = 0;
  let checkDate = new Date(asOfDate);
  checkDate.setHours(0, 0, 0, 0); // Normalize to start of day

  while (true) {
    const dateStr = toDateString(checkDate);
    const expectedOnDate = shouldBeCompletedOn(habit, checkDate);
    const completedOnDate = completionDates.includes(dateStr);

    // If this date was required but not completed, streak is broken
    if (expectedOnDate && !completedOnDate) {
      break;
    }

    // If completed (whether required or not), increment streak
    if (completedOnDate) {
      streak++;
    }

    // Move back one day
    checkDate.setDate(checkDate.getDate() - 1);

    // Stop if we've gone back more than reasonable (prevent infinite loop)
    if (streak > 0 && !completedOnDate && !expectedOnDate) {
      // We've passed the streak period
      break;
    }

    // Safety: don't go back more than 1 year
    const daysDiff = Math.floor((asOfDate - checkDate) / (1000 * 60 * 60 * 24));
    if (daysDiff > 365) break;
  }

  return streak;
}

/**
 * Calculate longest streak ever achieved
 */
function calculateLongestStreak(habit, completionDates) {
  if (completionDates.length === 0) return 0;

  let longestStreak = 0;
  let currentStreak = 0;

  // Sort dates ascending for sequential processing
  const sortedDates = [...completionDates].reverse();
  const startDate = new Date(sortedDates[0]);
  const endDate = new Date(sortedDates[sortedDates.length - 1]);

  let checkDate = new Date(startDate);
  checkDate.setHours(0, 0, 0, 0);

  while (checkDate <= endDate) {
    const dateStr = toDateString(checkDate);
    const expectedOnDate = shouldBeCompletedOn(habit, checkDate);
    const completedOnDate = completionDates.includes(dateStr);

    if (expectedOnDate && !completedOnDate) {
      // Streak broken
      longestStreak = Math.max(longestStreak, currentStreak);
      currentStreak = 0;
    } else if (completedOnDate) {
      currentStreak++;
    }

    checkDate.setDate(checkDate.getDate() + 1);
  }

  longestStreak = Math.max(longestStreak, currentStreak);
  return longestStreak;
}

/**
 * Calculate completion rates for different time windows
 */
function calculateCompletionRates(habit, completionDates, asOfDate) {
  const now = new Date(asOfDate);

  const rate7d = calculateRateForWindow(habit, completionDates, now, 7);
  const rate30d = calculateRateForWindow(habit, completionDates, now, 30);
  const rateAllTime = calculateRateForWindow(habit, completionDates, now, Infinity);

  return {
    rate7d: Math.round(rate7d * 100) / 100,
    rate30d: Math.round(rate30d * 100) / 100,
    rateAllTime: Math.round(rateAllTime * 100) / 100,
  };
}

/**
 * Calculate completion rate for a specific time window
 */
function calculateRateForWindow(habit, completionDates, endDate, daysBack) {
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - daysBack);
  startDate.setHours(0, 0, 0, 0);

  let expectedCount = 0;
  let completedCount = 0;

  let checkDate = new Date(startDate);
  const end = new Date(endDate);

  while (checkDate <= end) {
    const dateStr = toDateString(checkDate);
    const expected = shouldBeCompletedOn(habit, checkDate);
    const completed = completionDates.includes(dateStr);

    if (expected) {
      expectedCount++;
      if (completed) completedCount++;
    }

    checkDate.setDate(checkDate.getDate() + 1);
  }

  if (expectedCount === 0) return 0;
  return (completedCount / expectedCount) * 100;
}

/**
 * Determine if habit should be completed on a given date
 */
function shouldBeCompletedOn(habit, date) {
  if (habit.frequency_type === 'daily') {
    return true;
  }

  if (habit.frequency_type === 'weekly') {
    const dayOfWeek = date.getDay(); // 0 = Sunday, 6 = Saturday
    const targetDays = habit.frequency_config?.days || [];
    return targetDays.includes(dayOfWeek);
  }

  if (habit.frequency_type === 'custom') {
    // For custom frequency (e.g., "3 times per week"), we don't have specific days
    // So we can't determine if a specific date "should" be completed
    // Instead, we'll check if the weekly quota is met
    // For streak purposes, if any completion happens in the custom period, continue streak
    return true; // Be lenient with custom frequencies
  }

  return false;
}

/**
 * Update habit_streaks table with calculated statistics
 */
export async function updateHabitStreakCache(habitId) {
  try {
    const stats = await calculateStreak(habitId);

    // Check if streak record exists
    const { data: existing } = await supabase
      .from('habit_streaks')
      .select('id')
      .eq('habit_id', habitId)
      .maybeSingle();

    if (existing) {
      // Update existing record
      const { error } = await supabase
        .from('habit_streaks')
        .update(stats)
        .eq('habit_id', habitId);

      if (error) throw error;
    } else {
      // Insert new record
      const { error } = await supabase
        .from('habit_streaks')
        .insert({
          habit_id: habitId,
          ...stats,
        });

      if (error) throw error;
    }

    return stats;
  } catch (error) {
    console.error('Error updating streak cache:', error);
    throw error;
  }
}

/**
 * Helper: Convert date to YYYY-MM-DD string
 */
function toDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * ========================================
 * Cron Jobs for Automated Summaries
 * ========================================
 * Schedules automated generation of time-based summaries
 */

import cron from 'node-cron';
import { generateSummary } from './summaryGenerator.js';
import { detectBottlenecks } from './bottleneckDetector.js';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Daily job at midnight (generate yesterday summary and update week)
 * Runs: Every day at 12:00 AM
 */
cron.schedule('0 0 * * *', async () => {
  console.log('\n🕐 Running daily summary jobs...');

  try {
    // Generate yesterday's summary
    console.log('Generating yesterday summary...');
    await generateSummary('yesterday');

    // Update weekly summary
    console.log('Updating week summary...');
    await generateSummary('week');

    console.log('✅ Daily summary jobs completed\n');
  } catch (error) {
    console.error('❌ Daily summary jobs failed:', error);
  }
});

/**
 * Daily bottleneck detection at 1 AM
 * Runs: Every day at 1:00 AM (after summaries complete)
 */
cron.schedule('0 1 * * *', async () => {
  console.log('\n🔍 Running daily bottleneck detection...');

  try {
    // Get all active goals
    const { data: activeGoals, error } = await supabase
      .from('goals')
      .select('*')
      .eq('status', 'active');

    if (error) throw error;

    if (!activeGoals || activeGoals.length === 0) {
      console.log('No active goals to analyze.');
      return;
    }

    console.log(`Analyzing ${activeGoals.length} active goals...`);

    // Detect bottlenecks for each active goal
    for (const goal of activeGoals) {
      try {
        console.log(`Checking goal: ${goal.title} (${goal.area})`);
        await detectBottlenecks(goal.id);
      } catch (goalError) {
        console.error(`Error detecting bottlenecks for goal ${goal.id}:`, goalError);
        // Continue with other goals even if one fails
      }
    }

    console.log('✅ Bottleneck detection completed\n');
  } catch (error) {
    console.error('❌ Bottleneck detection failed:', error);
  }
});

/**
 * Weekly job on Sunday at midnight
 * Runs: Every Sunday at 12:00 AM
 */
cron.schedule('0 0 * * 0', async () => {
  console.log('\n🕐 Running weekly summary jobs...');

  try {
    // Update monthly summary
    console.log('Updating month summary...');
    await generateSummary('month');

    console.log('✅ Weekly summary jobs completed\n');
  } catch (error) {
    console.error('❌ Weekly summary jobs failed:', error);
  }
});

/**
 * Monthly job on the 1st at midnight
 * Runs: 1st day of every month at 12:00 AM
 */
cron.schedule('0 0 1 * *', async () => {
  console.log('\n🕐 Running monthly summary jobs...');

  try {
    // Update 3-month summary
    console.log('Updating 3month summary...');
    await generateSummary('3month');

    // Update 6-month summary
    console.log('Updating 6month summary...');
    await generateSummary('6month');

    // Update yearly summary
    console.log('Updating year summary...');
    await generateSummary('year');

    console.log('✅ Monthly summary jobs completed\n');
  } catch (error) {
    console.error('❌ Monthly summary jobs failed:', error);
  }
});

console.log('⏰ Cron jobs scheduled:');
console.log('  - Daily at midnight: yesterday + week summaries');
console.log('  - Daily at 1 AM: bottleneck detection for active goals');
console.log('  - Weekly on Sundays: month summary');
console.log('  - Monthly on 1st: 3month, 6month, year summaries');

-- ========================================
-- Optimus Migration Script
-- ========================================
-- This script migrates the existing chat_history table
-- to the new schema while preserving all data
-- ========================================

-- Step 1: Rename chat_history to chat_messages
ALTER TABLE IF EXISTS chat_history RENAME TO chat_messages;

-- Step 2: Add goal_id column (if it doesn't exist)
ALTER TABLE chat_messages
ADD COLUMN IF NOT EXISTS goal_id UUID REFERENCES goals(id) ON DELETE SET NULL;

-- Step 3: Create index for goal_id (if it doesn't exist)
CREATE INDEX IF NOT EXISTS idx_chat_messages_goal ON chat_messages (goal_id);

-- Step 4: Add role index (if it doesn't exist)
CREATE INDEX IF NOT EXISTS idx_chat_messages_role ON chat_messages (role);

-- Step 5: Verify migration
SELECT 'Migration complete! Table renamed and columns added.' AS status;

-- ========================================
-- Rollback Plan (if needed)
-- ========================================
-- To rollback this migration:
--
-- ALTER TABLE chat_messages RENAME TO chat_history;
-- ALTER TABLE chat_history DROP COLUMN IF EXISTS goal_id;
-- DROP INDEX IF EXISTS idx_chat_messages_goal;
-- DROP INDEX IF EXISTS idx_chat_messages_role;
--
-- ========================================

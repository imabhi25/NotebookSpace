-- Migration 003: Add conventions and convention mismatches to messages
ALTER TABLE messages ADD COLUMN IF NOT EXISTS conventions JSONB DEFAULT '[]';
ALTER TABLE messages ADD COLUMN IF NOT EXISTS convention_mismatches JSONB DEFAULT '[]';

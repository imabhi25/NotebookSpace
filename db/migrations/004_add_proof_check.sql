-- Migration 004: Add proof_check JSONB column to messages
ALTER TABLE messages ADD COLUMN IF NOT EXISTS proof_check JSONB;

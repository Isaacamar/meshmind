ALTER TABLE group_messages ADD COLUMN is_ai BOOLEAN DEFAULT FALSE;
ALTER TABLE group_messages ADD COLUMN model_name TEXT;

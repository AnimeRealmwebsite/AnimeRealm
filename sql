-- Create chat messages table
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  avatar_url TEXT,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create reactions table
CREATE TABLE IF NOT EXISTS message_reactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID REFERENCES chat_messages(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(message_id, user_id, emoji)
);

-- Create online users table
CREATE TABLE IF NOT EXISTS online_users (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  username TEXT NOT NULL,
  avatar_url TEXT,
  last_active TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE online_users ENABLE ROW LEVEL SECURITY;

-- Create policies for chat_messages
CREATE POLICY "Anyone can view messages" ON chat_messages FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert messages" ON chat_messages FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own messages" ON chat_messages FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own messages" ON chat_messages FOR DELETE USING (auth.uid() = user_id);

-- Create policies for message_reactions
CREATE POLICY "Anyone can view reactions" ON message_reactions FOR SELECT USING (true);
CREATE POLICY "Authenticated users can manage reactions" ON message_reactions FOR ALL USING (auth.uid() = user_id);

-- Create policies for online_users
CREATE POLICY "Anyone can view online users" ON online_users FOR SELECT USING (true);
CREATE POLICY "Users can manage their own presence" ON online_users FOR ALL USING (auth.uid() = user_id);

-- Create function to handle updated_at for messages
CREATE OR REPLACE FUNCTION handle_chat_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at on chat_messages
DROP TRIGGER IF EXISTS chat_messages_updated_at ON chat_messages;
CREATE TRIGGER chat_messages_updated_at
  BEFORE UPDATE ON chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION handle_chat_updated_at();

-- Create function to update last_active for online users
CREATE OR REPLACE FUNCTION update_user_last_active()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_active = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for last_active on online_users
DROP TRIGGER IF EXISTS online_users_last_active ON online_users;
CREATE TRIGGER online_users_last_active
  BEFORE UPDATE ON online_users
  FOR EACH ROW
  EXECUTE FUNCTION update_user_last_active();


-- Rode manualmente no SQL Editor do Supabase.
-- Não há framework de migração no projeto; este arquivo é só documentação/histórico.

-- Senha real (substitui data de nascimento como segredo de login)
ALTER TABLE users ADD COLUMN IF NOT EXISTS senha_hash text;

-- Sistema de XP/Nível (feature de escanear QR de amigos)
ALTER TABLE users ADD COLUMN IF NOT EXISTS xp integer NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS personal_code_hash text UNIQUE;

CREATE TABLE IF NOT EXISTS friend_scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scanner_id uuid NOT NULL REFERENCES users(id_user),
  scanned_id uuid NOT NULL REFERENCES users(id_user),
  created_at timestamptz DEFAULT now(),
  CONSTRAINT no_self_scan CHECK (scanner_id <> scanned_id),
  CONSTRAINT unique_pair UNIQUE (scanner_id, scanned_id)
);

/*
# Add brute-force protection to admin_login

## Problem
The admin_login() function has no protection against brute-force attacks.
An attacker can try unlimited password combinations without any lockout.

## Solution
1. New table `admin_login_attempts` — records every failed login attempt
   keyed by email address, with a timestamp.
2. Modified `admin_login()` — now returns jsonb instead of text:
   - Before attempting login, counts failed attempts in the last 15 minutes
     for the given email. If 5 or more, returns an error with the remaining
     lockout time.
   - On failed credentials, inserts a record into admin_login_attempts.
   - On successful login, deletes all old attempts for that email so the
     legitimate user starts fresh.
   - Returns `{ token: "..." }` on success, `{ error: "..." }` on failure.

## New Tables
- `admin_login_attempts`
  - `id` (bigint, primary key, auto-increment)
  - `email` (text, not null) — the email used in the login attempt
  - `attempted_at` (timestamptz, default now())

## Security
- RLS enabled on `admin_login_attempts`, no policies (deny all direct access).
  Only the SECURITY DEFINER `admin_login()` function can read/write this table.
- Index on (email, attempted_at) for efficient lockout queries.

## Important Notes
1. The admin_login() return type changes from `text` to `jsonb`.
   The frontend must be updated to handle the new response shape.
2. Lockout window: 15 minutes. Threshold: 5 failed attempts.
3. Successful logins clear the attempt history for that email.
*/

-- ── ADMIN LOGIN ATTEMPTS TABLE ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_login_attempts (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email        text NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE admin_login_attempts ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_admin_login_attempts_email_time
  ON admin_login_attempts (email, attempted_at DESC);

-- ── Drop old admin_login so we can change its return type ───────────────────────
DROP FUNCTION IF EXISTS admin_login(text, text);

-- ── Replace admin_login with brute-force protected version ──────────────────────
CREATE FUNCTION admin_login(p_email text, p_password text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hash          text;
  v_token         text;
  v_fail_count    integer;
  v_oldest        timestamptz;
  v_lock_minutes  integer;
BEGIN
  -- Prune attempts older than 1 hour to prevent unbounded growth
  DELETE FROM admin_login_attempts WHERE attempted_at < now() - interval '1 hour';

  -- Count failed attempts in the last 15 minutes for this email
  SELECT count(*), min(attempted_at)
    INTO v_fail_count, v_oldest
    FROM admin_login_attempts
   WHERE email = p_email
     AND attempted_at > now() - interval '15 minutes';

  IF v_fail_count >= 5 THEN
    v_lock_minutes := ceil(extract(epoch FROM (v_oldest + interval '15 minutes' - now())) / 60.0);
    IF v_lock_minutes < 1 THEN
      v_lock_minutes := 1;
    END IF;
    RETURN jsonb_build_object(
      'error',
      'Trop de tentatives échouées. Compte temporairement bloqué. Réessayez dans '
        || v_lock_minutes || ' minute' || CASE WHEN v_lock_minutes > 1 THEN 's' ELSE '' END || '.'
    );
  END IF;

  -- Verify credentials
  SELECT password_hash INTO v_hash FROM admin_users WHERE email = p_email;

  IF v_hash IS NULL OR v_hash != crypt(p_password, v_hash) THEN
    INSERT INTO admin_login_attempts (email) VALUES (p_email);
    RETURN jsonb_build_object('error', 'Email ou mot de passe incorrect.');
  END IF;

  -- Success: generate token, clear failed attempts
  v_token := encode(gen_random_bytes(32), 'hex');
  INSERT INTO admin_sessions (token) VALUES (v_token);
  DELETE FROM admin_login_attempts WHERE email = p_email;

  RETURN jsonb_build_object('token', v_token);
END;
$$;

GRANT EXECUTE ON FUNCTION admin_login(text, text) TO anon, authenticated;

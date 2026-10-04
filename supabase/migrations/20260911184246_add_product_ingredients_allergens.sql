ALTER TABLE products
  ADD COLUMN IF NOT EXISTS ingredients text DEFAULT '',
  ADD COLUMN IF NOT EXISTS allergens text DEFAULT '',
  ADD COLUMN IF NOT EXISTS weight text DEFAULT '';

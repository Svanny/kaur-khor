-- @risk:low
CREATE TABLE IF NOT EXISTS app.inventory_item (
  owner_sub TEXT NOT NULL,
  item_id TEXT NOT NULL,
  sku TEXT NOT NULL,
  name TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (owner_sub, item_id),
  UNIQUE (owner_sub, sku)
);

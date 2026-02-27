-- @risk:low
CREATE TABLE IF NOT EXISTS app.inventory_item_projection (
  owner_sub TEXT NOT NULL,
  item_id TEXT NOT NULL,
  sku TEXT NOT NULL,
  name TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity >= 0),
  source_event_id BIGINT NOT NULL,
  projected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (owner_sub, item_id),
  UNIQUE (owner_sub, sku)
);

CREATE INDEX IF NOT EXISTS idx_inventory_item_projection_source_event_id
  ON app.inventory_item_projection (source_event_id);

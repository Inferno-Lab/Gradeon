-- kind: contract
-- Gradeon Hue: the console's colours are the fixed cobalt seed; its stored colour overrides go.
DELETE FROM "console_settings" WHERE "key" = 'theme';

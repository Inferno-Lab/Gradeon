-- kind: contract
-- Tangent Hue (design/hue/BUILD.md): every colour is worked out from the school's brand colour, so the per-colour overrides go.
DELETE FROM "settings" WHERE "key" = 'theme.colors';

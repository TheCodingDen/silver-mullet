-- Add infra admin role
INSERT INTO "silver-mullet".public."PermissionGroupMapping" (
  id,
  "roleID",
  "guildID",
  "group"
) VALUES (
  'cljemqndk0000mb2woz9qh0x4',
  '1034191102670024808', -- Edit this to some arbitrary role you want to assign as infra admin to give yourself God powers for development
  '731581715474153542',
  'INFRA_ADMIN'
);

-- Add default CCAS configuration
-- If you're not a core developer of this system, it's inadvisable to twiddle with these without asking infra for an explanation of how it all works first
INSERT INTO "silver-mullet".public."CrossChannelAntiSpamSettings" (
  version,
  "minMessageLength",
  "shortMessageLength",
  "shortMessageSimilarityThreshold",
  "similarityThreshold",
  "cacheTTLSeconds",
  "maxSizeDiffPercentage",
  "pointsOnMatch"
) VALUES (
  1,
  10,
  15,
  85,
  128,
  180,
  30,
  1
);

INSERT INTO "silver-mullet".public."AntiSpamActionMapping" (
  id,
  "settingsVersion",
  points,
  action
) VALUES (
  'clngnzsja0000tq02ai773d66',
  1,
  5,
  'BAN'
);

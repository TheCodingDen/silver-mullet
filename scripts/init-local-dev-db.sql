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

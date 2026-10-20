-- Apply after EF migrations using the privileged migration role.
-- New tables/sequences stay inaccessible until their reviewed grants are added.
BEGIN;

REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM sonivo_app;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM sonivo_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
    public."Groups",
    public."GroupSlugHistory",
    public."GroupBranding",
    public."GroupRoles",
    public."Memberships",
    public."Invitations",
    public."ResourceGrants",
    public."Songs",
    public."Arrangements",
    public."Resources",
    public."Setlists",
    public."SetlistItems",
    public."Events",
    public."EventSetlistItems",
    public."Rsvps",
    public."Tasks" TO sonivo_app;

GRANT SELECT, INSERT ON TABLE
    public."AccountAudit",
    public."GroupAuditLog",
    public."WebhookEvents" TO sonivo_app;

GRANT SELECT, INSERT, UPDATE ON TABLE public."Notifications" TO sonivo_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
    public."AspNetRoles",
    public."AspNetRoleClaims",
    public."AspNetUsers",
    public."AspNetUserClaims",
    public."AspNetUserLogins",
    public."AspNetUserRoles",
    public."AspNetUserTokens" TO sonivo_app;

GRANT SELECT, INSERT, DELETE ON TABLE public."DataProtectionKeys" TO sonivo_app;

COMMIT;

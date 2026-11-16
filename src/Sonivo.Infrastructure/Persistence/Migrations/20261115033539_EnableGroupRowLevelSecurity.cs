using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Sonivo.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class EnableGroupRowLevelSecurity : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                DO $$
                BEGIN
                    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'sonivo_rls_reader') THEN
                        RAISE EXCEPTION 'The constrained sonivo_rls_reader role must be provisioned before enabling RLS';
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'sonivo_app') THEN
                        RAISE EXCEPTION 'The constrained sonivo_app role must be provisioned before enabling RLS';
                    END IF;
                END
                $$;

                CREATE OR REPLACE FUNCTION public.sonivo_rls_setting_uuid(setting_name text)
                RETURNS uuid
                LANGUAGE plpgsql
                STABLE
                SET search_path = pg_catalog
                AS $function$
                DECLARE
                    setting_value text;
                BEGIN
                    IF setting_name NOT IN (
                        'sonivo.user_id', 'sonivo.group_id', 'sonivo.multi_group_user_id',
                        'sonivo.bootstrap_group_id', 'sonivo.payment_webhook_group_id',
                        'sonivo.managed_account_group_id', 'sonivo.managed_account_user_id'
                    ) THEN
                        RETURN NULL;
                    END IF;
                    setting_value := nullif(pg_catalog.current_setting(setting_name, true), '');
                    IF setting_value IS NULL OR setting_value !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
                        RETURN NULL;
                    END IF;
                    RETURN setting_value::uuid;
                END
                $function$;

                CREATE OR REPLACE FUNCTION public.sonivo_rls_is_member(target_group_id uuid)
                RETURNS boolean
                LANGUAGE sql
                STABLE
                SECURITY DEFINER
                SET search_path = pg_catalog, pg_temp
                AS $function$
                    SELECT target_group_id IS NOT NULL
                       AND public.sonivo_rls_setting_uuid('sonivo.user_id') IS NOT NULL
                       AND EXISTS (
                            SELECT 1
                            FROM public."Memberships" AS m
                            WHERE m."GroupId" = target_group_id
                              AND m."UserId" = public.sonivo_rls_setting_uuid('sonivo.user_id')
                        )
                $function$;

                CREATE OR REPLACE FUNCTION public.sonivo_rls_user_is_member(target_user_id uuid, target_group_id uuid)
                RETURNS boolean
                LANGUAGE sql
                STABLE
                SECURITY DEFINER
                SET search_path = pg_catalog, pg_temp
                AS $function$
                    SELECT target_user_id IS NOT NULL
                       AND target_group_id IS NOT NULL
                       AND EXISTS (
                            SELECT 1
                            FROM public."Memberships" AS m
                            WHERE m."GroupId" = target_group_id AND m."UserId" = target_user_id
                        )
                $function$;

                ALTER FUNCTION public.sonivo_rls_is_member(uuid) OWNER TO sonivo_rls_reader;
                ALTER FUNCTION public.sonivo_rls_user_is_member(uuid, uuid) OWNER TO sonivo_rls_reader;
                GRANT USAGE ON SCHEMA public TO sonivo_rls_reader;
                GRANT SELECT ("UserId", "GroupId") ON public."Memberships" TO sonivo_rls_reader;
                REVOKE ALL ON FUNCTION public.sonivo_rls_setting_uuid(text) FROM PUBLIC;
                REVOKE ALL ON FUNCTION public.sonivo_rls_is_member(uuid) FROM PUBLIC;
                REVOKE ALL ON FUNCTION public.sonivo_rls_user_is_member(uuid, uuid) FROM PUBLIC;
                GRANT EXECUTE ON FUNCTION public.sonivo_rls_setting_uuid(text) TO sonivo_app;
                GRANT EXECUTE ON FUNCTION public.sonivo_rls_setting_uuid(text) TO sonivo_rls_reader;
                GRANT EXECUTE ON FUNCTION public.sonivo_rls_is_member(uuid) TO sonivo_app;
                GRANT EXECUTE ON FUNCTION public.sonivo_rls_user_is_member(uuid, uuid) TO sonivo_app;

                CREATE POLICY rls_membership_helper_read ON public."Memberships"
                    FOR SELECT TO sonivo_rls_reader USING (true);

                CREATE OR REPLACE FUNCTION public.sonivo_rls_group_read(target_group_id uuid)
                RETURNS boolean
                LANGUAGE sql
                STABLE
                SET search_path = pg_catalog
                AS $function$
                    SELECT public.sonivo_rls_is_member(target_group_id)
                       AND (target_group_id = public.sonivo_rls_setting_uuid('sonivo.group_id')
                            OR public.sonivo_rls_setting_uuid('sonivo.multi_group_user_id')
                               = public.sonivo_rls_setting_uuid('sonivo.user_id'))
                $function$;

                CREATE OR REPLACE FUNCTION public.sonivo_rls_group_write(target_group_id uuid)
                RETURNS boolean
                LANGUAGE sql
                STABLE
                SET search_path = pg_catalog
                AS $function$
                    SELECT public.sonivo_rls_is_member(target_group_id)
                       AND target_group_id = public.sonivo_rls_setting_uuid('sonivo.group_id')
                $function$;

                REVOKE ALL ON FUNCTION public.sonivo_rls_group_read(uuid) FROM PUBLIC;
                REVOKE ALL ON FUNCTION public.sonivo_rls_group_write(uuid) FROM PUBLIC;
                GRANT EXECUTE ON FUNCTION public.sonivo_rls_group_read(uuid) TO sonivo_app;
                GRANT EXECUTE ON FUNCTION public.sonivo_rls_group_write(uuid) TO sonivo_app;

                CREATE POLICY rls_membership_select ON public."Memberships"
                    FOR SELECT TO sonivo_app
                    USING (
                        "UserId" = public.sonivo_rls_setting_uuid('sonivo.user_id')
                        OR public.sonivo_rls_group_read("GroupId")
                        OR ("Handle" = nullif(pg_catalog.current_setting('sonivo.handle_value', true), '')
                            AND EXISTS (SELECT 1 FROM public."Groups" g
                                        WHERE g."Id" = "Memberships"."GroupId"
                                          AND g."Slug" = nullif(pg_catalog.current_setting('sonivo.handle_group_slug', true), '')))
                        OR ("GroupId" <> public.sonivo_rls_setting_uuid('sonivo.managed_account_group_id')
                            AND "UserId" = public.sonivo_rls_setting_uuid('sonivo.managed_account_user_id')
                            AND public.sonivo_rls_group_write(public.sonivo_rls_setting_uuid('sonivo.managed_account_group_id')))
                    );
                CREATE POLICY rls_membership_insert ON public."Memberships"
                    FOR INSERT TO sonivo_app
                    WITH CHECK (
                        public.sonivo_rls_group_write("GroupId")
                        OR ("GroupId" = public.sonivo_rls_setting_uuid('sonivo.bootstrap_group_id')
                            AND "UserId" = public.sonivo_rls_setting_uuid('sonivo.user_id')
                            AND "Role" = 'Owner')
                        OR ("UserId" = public.sonivo_rls_setting_uuid('sonivo.user_id')
                            AND EXISTS (SELECT 1 FROM public."Invitations" i
                                        WHERE i."GroupId" = "Memberships"."GroupId"
                                          AND i."TokenHash" = nullif(pg_catalog.current_setting('sonivo.invitation_token_hash', true), '')))
                    );
                CREATE POLICY rls_membership_update ON public."Memberships"
                    FOR UPDATE TO sonivo_app
                    USING (public.sonivo_rls_group_write("GroupId"))
                    WITH CHECK (public.sonivo_rls_group_write("GroupId"));
                CREATE POLICY rls_membership_managed_delete ON public."Memberships"
                    FOR DELETE TO sonivo_app
                    USING (public.sonivo_rls_group_write(public.sonivo_rls_setting_uuid('sonivo.managed_account_group_id'))
                           AND "GroupId" <> public.sonivo_rls_setting_uuid('sonivo.managed_account_group_id')
                           AND "UserId" = public.sonivo_rls_setting_uuid('sonivo.managed_account_user_id'));
                CREATE POLICY rls_membership_group_delete ON public."Memberships"
                    FOR DELETE TO sonivo_app
                    USING (public.sonivo_rls_group_write("GroupId"));

                DO $policies$
                DECLARE
                    table_name text;
                BEGIN
                    FOREACH table_name IN ARRAY ARRAY[
                        'GroupRoles', 'ResourceGrants', 'Songs', 'Arrangements', 'Tasks',
                        'Setlists', 'Events', 'GroupOwnershipTransfers', 'BillingLegacyGroupNotices'
                    ] LOOP
                        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
                        EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', table_name);
                        EXECUTE format('CREATE POLICY rls_select ON public.%I FOR SELECT TO sonivo_app USING (public.sonivo_rls_group_read("GroupId"))', table_name);
                        EXECUTE format('CREATE POLICY rls_insert ON public.%I FOR INSERT TO sonivo_app WITH CHECK (public.sonivo_rls_group_write("GroupId"))', table_name);
                        EXECUTE format('CREATE POLICY rls_update ON public.%I FOR UPDATE TO sonivo_app USING (public.sonivo_rls_group_write("GroupId")) WITH CHECK (public.sonivo_rls_group_write("GroupId"))', table_name);
                        EXECUTE format('CREATE POLICY rls_delete ON public.%I FOR DELETE TO sonivo_app USING (public.sonivo_rls_group_write("GroupId"))', table_name);
                    END LOOP;

                    FOREACH table_name IN ARRAY ARRAY['GroupAuditLog'] LOOP
                        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
                        EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', table_name);
                        EXECUTE format('CREATE POLICY rls_select ON public.%I FOR SELECT TO sonivo_app USING (public.sonivo_rls_group_read("GroupId"))', table_name);
                        EXECUTE format('CREATE POLICY rls_insert ON public.%I FOR INSERT TO sonivo_app WITH CHECK (public.sonivo_rls_group_write("GroupId") AND "ActorUserId" = public.sonivo_rls_setting_uuid(''sonivo.user_id''))', table_name);
                    END LOOP;
                END
                $policies$;

                ALTER TABLE public."Groups" ENABLE ROW LEVEL SECURITY;
                ALTER TABLE public."Groups" FORCE ROW LEVEL SECURITY;
                CREATE POLICY rls_groups_select ON public."Groups" FOR SELECT TO sonivo_app
                    USING (
                        public.sonivo_rls_group_read("Id")
                        OR ("Id" = public.sonivo_rls_setting_uuid('sonivo.bootstrap_group_id')
                            AND public.sonivo_rls_setting_uuid('sonivo.user_id') IS NOT NULL)
                        OR ("Id" = public.sonivo_rls_setting_uuid('sonivo.payment_webhook_group_id'))
                        OR ("Slug" = nullif(pg_catalog.current_setting('sonivo.public_group_slug', true), ''))
                        OR EXISTS (SELECT 1 FROM public."GroupSlugHistory" h
                                   WHERE h."GroupId" = "Groups"."Id"
                                     AND h."Slug" = nullif(pg_catalog.current_setting('sonivo.public_group_slug', true), ''))
                        OR (public.sonivo_rls_setting_uuid('sonivo.user_id') IS NOT NULL
                            AND "Slug" = nullif(pg_catalog.current_setting('sonivo.group_slug_lookup', true), ''))
                        OR ("Slug" = nullif(pg_catalog.current_setting('sonivo.handle_group_slug', true), ''))
                        OR (public.sonivo_rls_setting_uuid('sonivo.user_id') IS NOT NULL
                            AND ("Slug" = nullif(pg_catalog.current_setting('sonivo.member_group_slug', true), '')
                                 OR EXISTS (SELECT 1 FROM public."GroupSlugHistory" h
                                            WHERE h."GroupId" = "Groups"."Id"
                                              AND h."Slug" = nullif(pg_catalog.current_setting('sonivo.member_group_slug', true), '')
                                              AND public.sonivo_rls_is_member(h."GroupId"))))
                        OR EXISTS (SELECT 1 FROM public."Invitations" i
                                   WHERE i."GroupId" = "Groups"."Id"
                                     AND i."TokenHash" = nullif(pg_catalog.current_setting('sonivo.invitation_token_hash', true), ''))
                    );
                CREATE POLICY rls_groups_insert ON public."Groups" FOR INSERT TO sonivo_app
                    WITH CHECK ("Id" = public.sonivo_rls_setting_uuid('sonivo.bootstrap_group_id')
                                AND public.sonivo_rls_setting_uuid('sonivo.user_id') IS NOT NULL);
                CREATE POLICY rls_groups_update ON public."Groups" FOR UPDATE TO sonivo_app
                    USING (public.sonivo_rls_group_write("Id")
                           OR "Id" = public.sonivo_rls_setting_uuid('sonivo.payment_webhook_group_id'))
                    WITH CHECK (public.sonivo_rls_group_write("Id")
                                OR "Id" = public.sonivo_rls_setting_uuid('sonivo.payment_webhook_group_id'));
                CREATE POLICY rls_groups_delete ON public."Groups" FOR DELETE TO sonivo_app
                    USING (public.sonivo_rls_group_write("Id"));

                ALTER TABLE public."GroupSlugHistory" ENABLE ROW LEVEL SECURITY;
                ALTER TABLE public."GroupSlugHistory" FORCE ROW LEVEL SECURITY;
                CREATE POLICY rls_slug_history_select ON public."GroupSlugHistory" FOR SELECT TO sonivo_app
                    USING (public.sonivo_rls_group_read("GroupId")
                           OR "Slug" = nullif(pg_catalog.current_setting('sonivo.public_group_slug', true), '')
                           OR "Slug" = nullif(pg_catalog.current_setting('sonivo.group_slug_lookup', true), '')
                           OR (public.sonivo_rls_setting_uuid('sonivo.user_id') IS NOT NULL
                               AND "Slug" = nullif(pg_catalog.current_setting('sonivo.member_group_slug', true), '')
                               AND public.sonivo_rls_is_member("GroupId")));
                CREATE POLICY rls_slug_history_insert ON public."GroupSlugHistory" FOR INSERT TO sonivo_app
                    WITH CHECK (public.sonivo_rls_group_write("GroupId"));
                CREATE POLICY rls_slug_history_update ON public."GroupSlugHistory" FOR UPDATE TO sonivo_app
                    USING (public.sonivo_rls_group_write("GroupId"))
                    WITH CHECK (public.sonivo_rls_group_write("GroupId"));
                CREATE POLICY rls_slug_history_delete ON public."GroupSlugHistory" FOR DELETE TO sonivo_app
                    USING (public.sonivo_rls_group_write("GroupId"));

                ALTER TABLE public."GroupBranding" ENABLE ROW LEVEL SECURITY;
                ALTER TABLE public."GroupBranding" FORCE ROW LEVEL SECURITY;
                CREATE POLICY rls_branding_select ON public."GroupBranding" FOR SELECT TO sonivo_app
                    USING (public.sonivo_rls_group_read("GroupId")
                           OR EXISTS (SELECT 1 FROM public."GroupSlugHistory" h
                                      WHERE h."GroupId" = "GroupBranding"."GroupId"
                                        AND h."Slug" = nullif(pg_catalog.current_setting('sonivo.public_group_slug', true), '')));
                CREATE POLICY rls_branding_insert ON public."GroupBranding" FOR INSERT TO sonivo_app
                    WITH CHECK (public.sonivo_rls_group_write("GroupId"));
                CREATE POLICY rls_branding_update ON public."GroupBranding" FOR UPDATE TO sonivo_app
                    USING (public.sonivo_rls_group_write("GroupId"))
                    WITH CHECK (public.sonivo_rls_group_write("GroupId"));
                CREATE POLICY rls_branding_delete ON public."GroupBranding" FOR DELETE TO sonivo_app
                    USING (public.sonivo_rls_group_write("GroupId"));

                ALTER TABLE public."Invitations" ENABLE ROW LEVEL SECURITY;
                ALTER TABLE public."Invitations" FORCE ROW LEVEL SECURITY;
                CREATE POLICY rls_invitations_select ON public."Invitations" FOR SELECT TO sonivo_app
                    USING (public.sonivo_rls_group_read("GroupId")
                           OR "TokenHash" = nullif(pg_catalog.current_setting('sonivo.invitation_token_hash', true), ''));
                CREATE POLICY rls_invitations_insert ON public."Invitations" FOR INSERT TO sonivo_app
                    WITH CHECK (public.sonivo_rls_group_write("GroupId"));
                CREATE POLICY rls_invitations_update ON public."Invitations" FOR UPDATE TO sonivo_app
                    USING (public.sonivo_rls_group_write("GroupId")
                           OR "TokenHash" = nullif(pg_catalog.current_setting('sonivo.invitation_token_hash', true), ''))
                    WITH CHECK (public.sonivo_rls_group_write("GroupId")
                                OR "TokenHash" = nullif(pg_catalog.current_setting('sonivo.invitation_token_hash', true), ''));
                CREATE POLICY rls_invitations_delete ON public."Invitations" FOR DELETE TO sonivo_app
                    USING (public.sonivo_rls_group_write("GroupId"));

                ALTER TABLE public."SetlistItems" ENABLE ROW LEVEL SECURITY;
                ALTER TABLE public."SetlistItems" FORCE ROW LEVEL SECURITY;
                CREATE POLICY rls_setlist_items_select ON public."SetlistItems" FOR SELECT TO sonivo_app
                    USING (public.sonivo_rls_group_read("GroupId")
                           AND EXISTS (SELECT 1 FROM public."Setlists" s
                                       WHERE s."Id" = "SetlistItems"."SetlistId" AND s."GroupId" = "SetlistItems"."GroupId"));
                CREATE POLICY rls_setlist_items_insert ON public."SetlistItems" FOR INSERT TO sonivo_app
                    WITH CHECK (public.sonivo_rls_group_write("GroupId")
                                AND EXISTS (SELECT 1 FROM public."Setlists" s
                                            WHERE s."Id" = "SetlistItems"."SetlistId" AND s."GroupId" = "SetlistItems"."GroupId"));
                CREATE POLICY rls_setlist_items_update ON public."SetlistItems" FOR UPDATE TO sonivo_app
                    USING (public.sonivo_rls_group_write("GroupId")
                           AND EXISTS (SELECT 1 FROM public."Setlists" s
                                       WHERE s."Id" = "SetlistItems"."SetlistId" AND s."GroupId" = "SetlistItems"."GroupId"))
                    WITH CHECK (public.sonivo_rls_group_write("GroupId")
                                AND EXISTS (SELECT 1 FROM public."Setlists" s
                                            WHERE s."Id" = "SetlistItems"."SetlistId" AND s."GroupId" = "SetlistItems"."GroupId"));
                CREATE POLICY rls_setlist_items_delete ON public."SetlistItems" FOR DELETE TO sonivo_app
                    USING (public.sonivo_rls_group_write("GroupId")
                           AND EXISTS (SELECT 1 FROM public."Setlists" s
                                       WHERE s."Id" = "SetlistItems"."SetlistId" AND s."GroupId" = "SetlistItems"."GroupId"));

                ALTER TABLE public."EventSetlistItems" ENABLE ROW LEVEL SECURITY;
                ALTER TABLE public."EventSetlistItems" FORCE ROW LEVEL SECURITY;
                CREATE POLICY rls_event_setlist_items_select ON public."EventSetlistItems" FOR SELECT TO sonivo_app
                    USING (public.sonivo_rls_group_read("GroupId")
                           AND EXISTS (SELECT 1 FROM public."Events" e
                                       WHERE e."Id" = "EventSetlistItems"."EventId" AND e."GroupId" = "EventSetlistItems"."GroupId"));
                CREATE POLICY rls_event_setlist_items_insert ON public."EventSetlistItems" FOR INSERT TO sonivo_app
                    WITH CHECK (public.sonivo_rls_group_write("GroupId")
                                AND EXISTS (SELECT 1 FROM public."Events" e
                                            WHERE e."Id" = "EventSetlistItems"."EventId" AND e."GroupId" = "EventSetlistItems"."GroupId"));
                CREATE POLICY rls_event_setlist_items_update ON public."EventSetlistItems" FOR UPDATE TO sonivo_app
                    USING (public.sonivo_rls_group_write("GroupId")
                           AND EXISTS (SELECT 1 FROM public."Events" e
                                       WHERE e."Id" = "EventSetlistItems"."EventId" AND e."GroupId" = "EventSetlistItems"."GroupId"))
                    WITH CHECK (public.sonivo_rls_group_write("GroupId")
                                AND EXISTS (SELECT 1 FROM public."Events" e
                                            WHERE e."Id" = "EventSetlistItems"."EventId" AND e."GroupId" = "EventSetlistItems"."GroupId"));
                CREATE POLICY rls_event_setlist_items_delete ON public."EventSetlistItems" FOR DELETE TO sonivo_app
                    USING (public.sonivo_rls_group_write("GroupId")
                           AND EXISTS (SELECT 1 FROM public."Events" e
                                       WHERE e."Id" = "EventSetlistItems"."EventId" AND e."GroupId" = "EventSetlistItems"."GroupId"));

                ALTER TABLE public."Resources" ENABLE ROW LEVEL SECURITY;
                ALTER TABLE public."Resources" FORCE ROW LEVEL SECURITY;
                CREATE POLICY rls_resources_select ON public."Resources" FOR SELECT TO sonivo_app
                    USING (EXISTS (SELECT 1 FROM public."Arrangements" a
                                   WHERE a."Id" = "Resources"."ArrangementId"
                                     AND public.sonivo_rls_group_read(a."GroupId")));
                CREATE POLICY rls_resources_insert ON public."Resources" FOR INSERT TO sonivo_app
                    WITH CHECK (EXISTS (SELECT 1 FROM public."Arrangements" a
                                        WHERE a."Id" = "Resources"."ArrangementId"
                                          AND public.sonivo_rls_group_write(a."GroupId")));
                CREATE POLICY rls_resources_update ON public."Resources" FOR UPDATE TO sonivo_app
                    USING (EXISTS (SELECT 1 FROM public."Arrangements" a
                                   WHERE a."Id" = "Resources"."ArrangementId"
                                     AND public.sonivo_rls_group_write(a."GroupId")))
                    WITH CHECK (EXISTS (SELECT 1 FROM public."Arrangements" a
                                        WHERE a."Id" = "Resources"."ArrangementId"
                                          AND public.sonivo_rls_group_write(a."GroupId")));
                CREATE POLICY rls_resources_delete ON public."Resources" FOR DELETE TO sonivo_app
                    USING (EXISTS (SELECT 1 FROM public."Arrangements" a
                                   WHERE a."Id" = "Resources"."ArrangementId"
                                     AND public.sonivo_rls_group_write(a."GroupId")));

                ALTER TABLE public."Rsvps" ENABLE ROW LEVEL SECURITY;
                ALTER TABLE public."Rsvps" FORCE ROW LEVEL SECURITY;
                CREATE POLICY rls_rsvps_select ON public."Rsvps" FOR SELECT TO sonivo_app
                    USING (EXISTS (SELECT 1 FROM public."Events" e
                                   WHERE e."Id" = "Rsvps"."EventId"
                                     AND public.sonivo_rls_group_read(e."GroupId")));
                CREATE POLICY rls_rsvps_insert ON public."Rsvps" FOR INSERT TO sonivo_app
                    WITH CHECK ("UserId" = public.sonivo_rls_setting_uuid('sonivo.user_id')
                                AND EXISTS (SELECT 1 FROM public."Events" e
                                            WHERE e."Id" = "Rsvps"."EventId"
                                              AND public.sonivo_rls_group_write(e."GroupId")));
                CREATE POLICY rls_rsvps_update ON public."Rsvps" FOR UPDATE TO sonivo_app
                    USING ("UserId" = public.sonivo_rls_setting_uuid('sonivo.user_id')
                           AND EXISTS (SELECT 1 FROM public."Events" e
                                       WHERE e."Id" = "Rsvps"."EventId"
                                         AND public.sonivo_rls_group_write(e."GroupId")))
                    WITH CHECK ("UserId" = public.sonivo_rls_setting_uuid('sonivo.user_id')
                                AND EXISTS (SELECT 1 FROM public."Events" e
                                            WHERE e."Id" = "Rsvps"."EventId"
                                              AND public.sonivo_rls_group_write(e."GroupId")));

                ALTER TABLE public."SongFavorites" ENABLE ROW LEVEL SECURITY;
                ALTER TABLE public."SongFavorites" FORCE ROW LEVEL SECURITY;
                CREATE POLICY rls_song_favorites_select ON public."SongFavorites" FOR SELECT TO sonivo_app
                    USING ("UserId" = public.sonivo_rls_setting_uuid('sonivo.user_id')
                           AND public.sonivo_rls_group_read("GroupId"));
                CREATE POLICY rls_song_favorites_insert ON public."SongFavorites" FOR INSERT TO sonivo_app
                    WITH CHECK ("UserId" = public.sonivo_rls_setting_uuid('sonivo.user_id')
                                AND public.sonivo_rls_group_write("GroupId"));
                CREATE POLICY rls_song_favorites_update ON public."SongFavorites" FOR UPDATE TO sonivo_app
                    USING ("UserId" = public.sonivo_rls_setting_uuid('sonivo.user_id')
                           AND public.sonivo_rls_group_write("GroupId"))
                    WITH CHECK ("UserId" = public.sonivo_rls_setting_uuid('sonivo.user_id')
                                AND public.sonivo_rls_group_write("GroupId"));
                CREATE POLICY rls_song_favorites_delete ON public."SongFavorites" FOR DELETE TO sonivo_app
                    USING ("UserId" = public.sonivo_rls_setting_uuid('sonivo.user_id')
                           AND public.sonivo_rls_group_write("GroupId"));

                ALTER TABLE public."Notifications" ENABLE ROW LEVEL SECURITY;
                ALTER TABLE public."Notifications" FORCE ROW LEVEL SECURITY;
                CREATE POLICY rls_notifications_select ON public."Notifications" FOR SELECT TO sonivo_app
                    USING ("UserId" = public.sonivo_rls_setting_uuid('sonivo.user_id'));
                CREATE POLICY rls_notifications_insert ON public."Notifications" FOR INSERT TO sonivo_app
                    WITH CHECK (
                        ("Scope" = 0 AND "GroupId" IS NULL AND "UserId" = public.sonivo_rls_setting_uuid('sonivo.user_id'))
                        OR ("Scope" = 1 AND "GroupId" IS NOT NULL
                            AND "ActorUserId" = public.sonivo_rls_setting_uuid('sonivo.user_id')
                            AND public.sonivo_rls_group_write("GroupId")
                            AND public.sonivo_rls_user_is_member("UserId", "GroupId"))
                    );
                CREATE POLICY rls_notifications_update ON public."Notifications" FOR UPDATE TO sonivo_app
                    USING ("UserId" = public.sonivo_rls_setting_uuid('sonivo.user_id'))
                    WITH CHECK ("UserId" = public.sonivo_rls_setting_uuid('sonivo.user_id'));

                ALTER TABLE public."AccountAudit" ENABLE ROW LEVEL SECURITY;
                ALTER TABLE public."AccountAudit" FORCE ROW LEVEL SECURITY;
                CREATE POLICY rls_account_audit_select ON public."AccountAudit" FOR SELECT TO sonivo_app
                    USING ("TargetUserId" = public.sonivo_rls_setting_uuid('sonivo.user_id'));
                CREATE POLICY rls_account_audit_insert ON public."AccountAudit" FOR INSERT TO sonivo_app
                    WITH CHECK (("ActorUserId" = public.sonivo_rls_setting_uuid('sonivo.user_id')
                                 OR "TargetUserId" = public.sonivo_rls_setting_uuid('sonivo.user_id'))
                                AND ("GroupId" IS NULL OR public.sonivo_rls_group_write("GroupId")));

                DO $enable$
                DECLARE
                    table_name text;
                BEGIN
                    FOREACH table_name IN ARRAY ARRAY[
                        'Memberships', 'GroupRoles', 'ResourceGrants', 'Songs', 'Arrangements',
                        'Tasks', 'Setlists', 'Events', 'GroupOwnershipTransfers',
                        'BillingLegacyGroupNotices', 'GroupAuditLog', 'Groups', 'GroupSlugHistory',
                        'GroupBranding', 'Invitations', 'SetlistItems', 'EventSetlistItems',
                        'Resources', 'Rsvps', 'SongFavorites', 'Notifications', 'AccountAudit'
                    ] LOOP
                        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
                        EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', table_name);
                    END LOOP;
                END
                $enable$;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            throw new NotSupportedException(
                "Disabling tenant row security would expose cross-Group data. Roll forward with a reviewed policy fix instead.");
        }
    }
}

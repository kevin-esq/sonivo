using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Sonivo.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AllowCurrentSlugPublicBranding : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                DROP POLICY rls_branding_select ON public."GroupBranding";
                CREATE POLICY rls_branding_select ON public."GroupBranding" FOR SELECT TO sonivo_app
                    USING (public.sonivo_rls_group_read("GroupId")
                           OR EXISTS (SELECT 1 FROM public."Groups" g
                                      WHERE g."Id" = "GroupBranding"."GroupId"
                                        AND g."Slug" = nullif(pg_catalog.current_setting('sonivo.public_group_slug', true), ''))
                           OR EXISTS (SELECT 1 FROM public."GroupSlugHistory" h
                                      WHERE h."GroupId" = "GroupBranding"."GroupId"
                                        AND h."Slug" = nullif(pg_catalog.current_setting('sonivo.public_group_slug', true), '')));
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                DROP POLICY rls_branding_select ON public."GroupBranding";
                CREATE POLICY rls_branding_select ON public."GroupBranding" FOR SELECT TO sonivo_app
                    USING (public.sonivo_rls_group_read("GroupId")
                           OR EXISTS (SELECT 1 FROM public."GroupSlugHistory" h
                                      WHERE h."GroupId" = "GroupBranding"."GroupId"
                                        AND h."Slug" = nullif(pg_catalog.current_setting('sonivo.public_group_slug', true), '')));
                """);
        }
    }
}

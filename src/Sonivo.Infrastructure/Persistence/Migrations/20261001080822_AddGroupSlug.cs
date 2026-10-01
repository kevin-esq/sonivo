using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Sonivo.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddGroupSlug : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Slug",
                table: "Groups",
                type: "character varying(40)",
                maxLength: 40,
                nullable: true);

            // Idempotent, resumable backfill (ADR-0048 D1): only rows where
            // Slug IS NULL are filled, and the whole statement is atomic inside
            // the migration transaction, so re-running after a failure restarts
            // from the unfinished rows. The Groups table is small (thousands),
            // so a single ordered pass is preferred over paged batches; the
            // unique index is created after this backfill.
            migrationBuilder.Sql("""
                WITH normalized AS (
                  SELECT "Id",
                    CASE
                      WHEN length(trim(both '-' from regexp_replace(
                             translate(lower("Name"),
                               'áàäâãéèëêíìïîóòöôõúùüûñç',
                               'aaaaaeeeeiiiiooooouuuunc'),
                             '[^a-z0-9]+', '-', 'g'))) < 3
                        THEN 'grupo'
                      ELSE trim(both '-' from regexp_replace(
                             translate(lower("Name"),
                               'áàäâãéèëêíìïîóòöôõúùüûñç',
                               'aaaaaeeeeiiiiooooouuuunc'),
                             '[^a-z0-9]+', '-', 'g'))
                    END AS base
                  FROM "Groups"
                  WHERE "Slug" IS NULL
                ),
                reserved_checked AS (
                  SELECT "Id",
                    CASE WHEN left(base, 40) IN (
                      'api','auth','admin','app','account','assets','cuenta','error',
                      'favicon','g','group','groups','health','help','join','login',
                      'logout','mail','manifest','privacy','register','robots','settings',
                      'sitemap','static','support','terms','www')
                      THEN left(base, 34) || '-grupo'
                      ELSE left(base, 40)
                    END AS base
                  FROM normalized
                ),
                ranked AS (
                  SELECT "Id", base,
                    row_number() OVER (PARTITION BY base ORDER BY "Id") AS rn
                  FROM reserved_checked
                )
                UPDATE "Groups" g
                SET "Slug" = CASE
                    WHEN ranked.rn = 1 THEN ranked.base
                    ELSE left(ranked.base, 40 - length('-' || ranked.rn)) || '-' || ranked.rn
                  END
                FROM ranked
                WHERE g."Id" = ranked."Id";
                """);

            migrationBuilder.CreateIndex(
                name: "IX_Groups_Slug",
                table: "Groups",
                column: "Slug",
                unique: true,
                filter: "\"Slug\" IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Groups_Slug",
                table: "Groups");

            migrationBuilder.DropColumn(
                name: "Slug",
                table: "Groups");
        }
    }
}

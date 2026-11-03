using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Sonivo.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddSongCatalogMetadata : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Album",
                table: "Songs",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CoverImageContentType",
                table: "Songs",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CoverImageObjectKey",
                table: "Songs",
                type: "character varying(512)",
                maxLength: 512,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "ReleaseYear",
                table: "Songs",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SongTagDefinitions",
                table: "Groups",
                type: "text",
                nullable: true);

            migrationBuilder.Sql("""
                UPDATE "Groups" AS g
                SET "SongTagDefinitions" = legacy."Tags"
                FROM (
                    SELECT s."GroupId",
                           string_agg(DISTINCT lower(btrim(item.tag)), ',' ORDER BY lower(btrim(item.tag))) AS "Tags"
                    FROM "Songs" AS s
                    CROSS JOIN LATERAL unnest(string_to_array(s."Tags", ',')) AS item(tag)
                    WHERE s."DeletedAt" IS NULL AND s."Tags" IS NOT NULL AND btrim(item.tag) <> ''
                    GROUP BY s."GroupId"
                ) AS legacy
                WHERE g."Id" = legacy."GroupId";
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Album",
                table: "Songs");

            migrationBuilder.DropColumn(
                name: "CoverImageContentType",
                table: "Songs");

            migrationBuilder.DropColumn(
                name: "CoverImageObjectKey",
                table: "Songs");

            migrationBuilder.DropColumn(
                name: "ReleaseYear",
                table: "Songs");

            migrationBuilder.DropColumn(
                name: "SongTagDefinitions",
                table: "Groups");
        }
    }
}

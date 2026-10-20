using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Sonivo.Infrastructure.Persistence.Migrations;

/// <inheritdoc />
public partial class EnforceSetlistItemParentGroupScope : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql(
            """
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1
                    FROM "SetlistItems" AS item
                    JOIN "Setlists" AS setlist ON setlist."Id" = item."SetlistId"
                    WHERE item."GroupId" <> setlist."GroupId") THEN
                    RAISE EXCEPTION 'Cannot enforce same-Group Setlist item ownership: cross-Group references exist.';
                END IF;
            END
            $$;
            """);

        migrationBuilder.DropForeignKey(
            name: "FK_SetlistItems_Setlists_SetlistId",
            table: "SetlistItems");

        migrationBuilder.DropIndex(
            name: "IX_SetlistItems_SetlistId_SortOrder",
            table: "SetlistItems");

        migrationBuilder.AddUniqueConstraint(
            name: "AK_Setlists_GroupId_Id",
            table: "Setlists",
            columns: new[] { "GroupId", "Id" });

        migrationBuilder.CreateIndex(
            name: "IX_SetlistItems_GroupId_SetlistId_SortOrder",
            table: "SetlistItems",
            columns: new[] { "GroupId", "SetlistId", "SortOrder" });

        migrationBuilder.AddForeignKey(
            name: "FK_SetlistItems_Setlists_GroupId_SetlistId",
            table: "SetlistItems",
            columns: new[] { "GroupId", "SetlistId" },
            principalTable: "Setlists",
            principalColumns: new[] { "GroupId", "Id" },
            onDelete: ReferentialAction.Cascade);
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropForeignKey(
            name: "FK_SetlistItems_Setlists_GroupId_SetlistId",
            table: "SetlistItems");

        migrationBuilder.DropUniqueConstraint(
            name: "AK_Setlists_GroupId_Id",
            table: "Setlists");

        migrationBuilder.DropIndex(
            name: "IX_SetlistItems_GroupId_SetlistId_SortOrder",
            table: "SetlistItems");

        migrationBuilder.CreateIndex(
            name: "IX_SetlistItems_SetlistId_SortOrder",
            table: "SetlistItems",
            columns: new[] { "SetlistId", "SortOrder" });

        migrationBuilder.AddForeignKey(
            name: "FK_SetlistItems_Setlists_SetlistId",
            table: "SetlistItems",
            column: "SetlistId",
            principalTable: "Setlists",
            principalColumn: "Id",
            onDelete: ReferentialAction.Cascade);
    }
}

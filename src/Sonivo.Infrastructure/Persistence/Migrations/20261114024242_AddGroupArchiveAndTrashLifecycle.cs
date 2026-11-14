using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Sonivo.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddGroupArchiveAndTrashLifecycle : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "ArchivedAt",
                table: "Groups",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "TrashExpiresAt",
                table: "Groups",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.Sql("""
                UPDATE "Groups"
                SET "TrashExpiresAt" = CURRENT_TIMESTAMP + INTERVAL '30 days'
                WHERE "DeletedAt" IS NOT NULL AND "TrashExpiresAt" IS NULL;
                """);

            migrationBuilder.CreateIndex(
                name: "IX_Groups_TrashExpiresAt",
                table: "Groups",
                column: "TrashExpiresAt",
                filter: "\"TrashExpiresAt\" IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Groups_TrashExpiresAt",
                table: "Groups");

            migrationBuilder.DropColumn(
                name: "ArchivedAt",
                table: "Groups");

            migrationBuilder.DropColumn(
                name: "TrashExpiresAt",
                table: "Groups");
        }
    }
}

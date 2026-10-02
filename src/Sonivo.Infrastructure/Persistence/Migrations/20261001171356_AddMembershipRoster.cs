using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Sonivo.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddMembershipRoster : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Memberships_UserId_GroupId",
                table: "Memberships");

            migrationBuilder.AlterColumn<Guid>(
                name: "UserId",
                table: "Memberships",
                type: "uuid",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uuid");

            migrationBuilder.AddColumn<string>(
                name: "DisplayName",
                table: "Memberships",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            // AlterColumn can leave a zero-guid DEFAULT behind; roster rows must be
            // NULL, never the empty guid.
            migrationBuilder.Sql("ALTER TABLE \"Memberships\" ALTER COLUMN \"UserId\" DROP DEFAULT;");

            migrationBuilder.CreateIndex(
                name: "IX_Memberships_UserId_GroupId",
                table: "Memberships",
                columns: new[] { "UserId", "GroupId" },
                unique: true,
                filter: "\"UserId\" IS NOT NULL");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Memberships_OwnerHasUser",
                table: "Memberships",
                sql: "\"Role\" <> 'Owner' OR \"UserId\" IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Memberships_UserId_GroupId",
                table: "Memberships");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Memberships_OwnerHasUser",
                table: "Memberships");

            migrationBuilder.DropColumn(
                name: "DisplayName",
                table: "Memberships");

            migrationBuilder.AlterColumn<Guid>(
                name: "UserId",
                table: "Memberships",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "uuid",
                oldNullable: true);

            migrationBuilder.Sql("ALTER TABLE \"Memberships\" ALTER COLUMN \"UserId\" DROP DEFAULT;");

            migrationBuilder.CreateIndex(
                name: "IX_Memberships_UserId_GroupId",
                table: "Memberships",
                columns: new[] { "UserId", "GroupId" },
                unique: true);
        }
    }
}

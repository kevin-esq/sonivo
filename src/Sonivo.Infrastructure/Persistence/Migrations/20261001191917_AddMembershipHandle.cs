using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Sonivo.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddMembershipHandle : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Handle",
                table: "Memberships",
                type: "character varying(32)",
                maxLength: 32,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Memberships_GroupId_Handle",
                table: "Memberships",
                columns: new[] { "GroupId", "Handle" },
                unique: true,
                filter: "\"Handle\" IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Memberships_GroupId_Handle",
                table: "Memberships");

            migrationBuilder.DropColumn(
                name: "Handle",
                table: "Memberships");
        }
    }
}

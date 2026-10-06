using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Sonivo.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddGroupPlan : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "PlanId",
                table: "Groups",
                type: "character varying(16)",
                maxLength: 16,
                nullable: false,
                defaultValue: "studio");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "PlanId",
                table: "Groups");
        }
    }
}

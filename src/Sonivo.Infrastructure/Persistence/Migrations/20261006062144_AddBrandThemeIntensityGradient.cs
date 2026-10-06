using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Sonivo.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddBrandThemeIntensityGradient : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "GradientStyle",
                table: "GroupBranding",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Intensity",
                table: "GroupBranding",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ThemeId",
                table: "GroupBranding",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "GradientStyle",
                table: "GroupBranding");

            migrationBuilder.DropColumn(
                name: "Intensity",
                table: "GroupBranding");

            migrationBuilder.DropColumn(
                name: "ThemeId",
                table: "GroupBranding");
        }
    }
}

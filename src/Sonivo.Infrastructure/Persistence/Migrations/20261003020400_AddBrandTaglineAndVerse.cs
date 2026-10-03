using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Sonivo.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddBrandTaglineAndVerse : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Tagline",
                table: "GroupBranding",
                type: "character varying(160)",
                maxLength: 160,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Verse",
                table: "GroupBranding",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Tagline",
                table: "GroupBranding");

            migrationBuilder.DropColumn(
                name: "Verse",
                table: "GroupBranding");
        }
    }
}

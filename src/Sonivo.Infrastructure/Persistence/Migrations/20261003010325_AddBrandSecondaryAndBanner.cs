using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Sonivo.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddBrandSecondaryAndBanner : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "BannerBlobKey",
                table: "GroupBranding",
                type: "character varying(256)",
                maxLength: 256,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "BannerContentType",
                table: "GroupBranding",
                type: "character varying(128)",
                maxLength: 128,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SecondaryHex",
                table: "GroupBranding",
                type: "character varying(7)",
                maxLength: 7,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "BannerBlobKey",
                table: "GroupBranding");

            migrationBuilder.DropColumn(
                name: "BannerContentType",
                table: "GroupBranding");

            migrationBuilder.DropColumn(
                name: "SecondaryHex",
                table: "GroupBranding");
        }
    }
}

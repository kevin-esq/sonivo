using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Sonivo.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddBrandAccentAndSemanticColors : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "AccentColorHex",
                table: "GroupBranding",
                type: "character varying(7)",
                maxLength: 7,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ErrorHex",
                table: "GroupBranding",
                type: "character varying(7)",
                maxLength: 7,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "FaviconBlobKey",
                table: "GroupBranding",
                type: "character varying(256)",
                maxLength: 256,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "FaviconContentType",
                table: "GroupBranding",
                type: "character varying(128)",
                maxLength: 128,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SuccessHex",
                table: "GroupBranding",
                type: "character varying(7)",
                maxLength: 7,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Typography",
                table: "GroupBranding",
                type: "character varying(16)",
                maxLength: 16,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "WarningHex",
                table: "GroupBranding",
                type: "character varying(7)",
                maxLength: 7,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AccentColorHex",
                table: "GroupBranding");

            migrationBuilder.DropColumn(
                name: "ErrorHex",
                table: "GroupBranding");

            migrationBuilder.DropColumn(
                name: "FaviconBlobKey",
                table: "GroupBranding");

            migrationBuilder.DropColumn(
                name: "FaviconContentType",
                table: "GroupBranding");

            migrationBuilder.DropColumn(
                name: "SuccessHex",
                table: "GroupBranding");

            migrationBuilder.DropColumn(
                name: "Typography",
                table: "GroupBranding");

            migrationBuilder.DropColumn(
                name: "WarningHex",
                table: "GroupBranding");
        }
    }
}

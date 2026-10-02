using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Sonivo.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddGroupBranding : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "GroupBranding",
                columns: table => new
                {
                    GroupId = table.Column<Guid>(type: "uuid", nullable: false),
                    DisplayName = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: true),
                    AccentHex = table.Column<string>(type: "character varying(7)", maxLength: 7, nullable: true),
                    CoverKind = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: true),
                    CoverValue = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: true),
                    ThemeDefault = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: true),
                    DefaultLocale = table.Column<string>(type: "character varying(8)", maxLength: 8, nullable: true),
                    WelcomeText = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    LoginHeadline = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    LogoBlobKey = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true),
                    LogoContentType = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    ShowSonivoCredit = table.Column<bool>(type: "boolean", nullable: false),
                    Version = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GroupBranding", x => x.GroupId);
                    table.ForeignKey(
                        name: "FK_GroupBranding_Groups_GroupId",
                        column: x => x.GroupId,
                        principalTable: "Groups",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "GroupBranding");
        }
    }
}

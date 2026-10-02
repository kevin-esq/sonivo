using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Sonivo.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddGroupRolesAndAudit : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_Memberships_Role",
                table: "Memberships");

            migrationBuilder.AddColumn<string>(
                name: "MusicalRole",
                table: "Memberships",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "GroupAuditLog",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    GroupId = table.Column<Guid>(type: "uuid", nullable: false),
                    ActorUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    TargetUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    Action = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Metadata = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GroupAuditLog", x => x.Id);
                    table.ForeignKey(
                        name: "FK_GroupAuditLog_Groups_GroupId",
                        column: x => x.GroupId,
                        principalTable: "Groups",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.AddCheckConstraint(
                name: "CK_Memberships_Role",
                table: "Memberships",
                sql: "\"Role\" IN ('Owner', 'Manager', 'Member', 'Viewer')");

            migrationBuilder.CreateIndex(
                name: "IX_GroupAuditLog_GroupId_CreatedAt",
                table: "GroupAuditLog",
                columns: new[] { "GroupId", "CreatedAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "GroupAuditLog");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Memberships_Role",
                table: "Memberships");

            migrationBuilder.DropColumn(
                name: "MusicalRole",
                table: "Memberships");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Memberships_Role",
                table: "Memberships",
                sql: "\"Role\" IN ('Owner', 'Member')");
        }
    }
}

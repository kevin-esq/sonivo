using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Sonivo.Infrastructure.Persistence;

#nullable disable

namespace Sonivo.Infrastructure.Persistence.Migrations;

[DbContext(typeof(SonivoDbContext))]
[Migration("20261017120000_GroupRolePermissionProfiles")]
public partial class GroupRolePermissionProfiles : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        // Existing custom roles were additive. Preserve that behavior so this
        // migration does not silently remove access from assigned members.
        migrationBuilder.AddColumn<bool>(
            name: "ExtendsBaseRole",
            table: "GroupRoles",
            type: "boolean",
            nullable: false,
            defaultValue: true);

        // New roles created after the migration are exact permission profiles.
        migrationBuilder.AlterColumn<bool>(
            name: "ExtendsBaseRole",
            table: "GroupRoles",
            type: "boolean",
            nullable: false,
            defaultValue: false,
            oldClrType: typeof(bool),
            oldType: "boolean",
            oldDefaultValue: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(
            name: "ExtendsBaseRole",
            table: "GroupRoles");
    }
}

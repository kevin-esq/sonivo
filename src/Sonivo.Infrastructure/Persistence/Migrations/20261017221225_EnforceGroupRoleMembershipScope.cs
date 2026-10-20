using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Sonivo.Infrastructure.Persistence.Migrations;

/// <inheritdoc />
public partial class EnforceGroupRoleMembershipScope : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql(
            """
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1
                    FROM "Memberships" AS membership
                    JOIN "GroupRoles" AS role ON role."Id" = membership."GroupRoleId"
                    WHERE membership."GroupRoleId" IS NOT NULL
                      AND membership."GroupId" <> role."GroupId") THEN
                    RAISE EXCEPTION 'Cannot enforce group-scoped GroupRole assignments: cross-group membership references exist.';
                END IF;

                IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_Memberships_GroupRoles_GroupRoleId' AND conrelid = '"Memberships"'::regclass) THEN
                    EXECUTE 'ALTER TABLE "Memberships" DROP CONSTRAINT "FK_Memberships_GroupRoles_GroupRoleId"';
                END IF;
                IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_Memberships_GroupRoles_GroupId_GroupRoleId' AND conrelid = '"Memberships"'::regclass) THEN
                    EXECUTE 'ALTER TABLE "Memberships" DROP CONSTRAINT "FK_Memberships_GroupRoles_GroupId_GroupRoleId"';
                END IF;
                IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AK_GroupRoles_GroupId_Id' AND conrelid = '"GroupRoles"'::regclass) THEN
                    EXECUTE 'ALTER TABLE "GroupRoles" DROP CONSTRAINT "AK_GroupRoles_GroupId_Id"';
                END IF;
                IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'IX_Memberships_GroupRoleId' AND relkind = 'i') THEN
                    EXECUTE 'DROP INDEX "IX_Memberships_GroupRoleId"';
                END IF;
                IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'IX_Memberships_GroupId_GroupRoleId' AND relkind = 'i') THEN
                    EXECUTE 'DROP INDEX "IX_Memberships_GroupId_GroupRoleId"';
                END IF;

                EXECUTE 'ALTER TABLE "GroupRoles" ADD CONSTRAINT "AK_GroupRoles_GroupId_Id" UNIQUE ("GroupId", "Id")';
                EXECUTE 'CREATE INDEX "IX_Memberships_GroupId_GroupRoleId" ON "Memberships" ("GroupId", "GroupRoleId")';
                EXECUTE 'ALTER TABLE "Memberships"
                    ADD CONSTRAINT "FK_Memberships_GroupRoles_GroupId_GroupRoleId"
                    FOREIGN KEY ("GroupId", "GroupRoleId")
                    REFERENCES "GroupRoles" ("GroupId", "Id")
                    ON DELETE RESTRICT';
            END
            $$;
            """);
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql(
            """
            ALTER TABLE "Memberships" DROP CONSTRAINT "FK_Memberships_GroupRoles_GroupId_GroupRoleId";
            DROP INDEX "IX_Memberships_GroupId_GroupRoleId";
            ALTER TABLE "GroupRoles" DROP CONSTRAINT "AK_GroupRoles_GroupId_Id";
            CREATE INDEX "IX_Memberships_GroupRoleId" ON "Memberships" ("GroupRoleId");
            ALTER TABLE "Memberships"
                ADD CONSTRAINT "FK_Memberships_GroupRoles_GroupRoleId"
                FOREIGN KEY ("GroupRoleId") REFERENCES "GroupRoles" ("Id") ON DELETE SET NULL;
            """);
    }
}

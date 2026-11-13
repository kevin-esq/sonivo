using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Sonivo.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class EnforceSingleGroupOwnerAndOwnershipTransfer : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Memberships_GroupId",
                table: "Memberships");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Memberships_OwnerHasUser",
                table: "Memberships");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Memberships_Role",
                table: "Memberships");

            migrationBuilder.Sql("""
                DO $$ BEGIN
                    IF EXISTS (
                        SELECT 1 FROM "Groups" g
                        WHERE g."DeletedAt" IS NULL AND NOT EXISTS (
                            SELECT 1 FROM "Memberships" m
                            WHERE m."GroupId" = g."Id" AND m."Role" = 'Owner'
                        )
                    ) THEN
                        RAISE EXCEPTION 'Single-owner migration requires an Owner for every active Group';
                    END IF;
                END $$;

                WITH ranked AS (
                    SELECT "Id", row_number() OVER (
                        PARTITION BY "GroupId" ORDER BY "CreatedAt", "Id"
                    ) AS position
                    FROM "Memberships"
                    WHERE "Role" = 'Owner'
                ), demoted AS (
                    UPDATE "Memberships" m
                    SET "Role" = 'Member', "GroupRoleId" = NULL
                    FROM ranked r
                    WHERE m."Id" = r."Id" AND r.position > 1
                    RETURNING m."GroupId", m."UserId"
                )
                INSERT INTO "GroupAuditLog" ("Id", "GroupId", "ActorUserId", "TargetUserId", "Action", "Metadata", "CreatedAt")
                SELECT gen_random_uuid(), "GroupId", NULL, "UserId", 'owner_migrated_to_member',
                    'kept-oldest-owner', now()
                FROM demoted;

                UPDATE "Memberships" SET "Role" = 'Admin' WHERE "Role" = 'Manager';
                """);

            migrationBuilder.CreateTable(
                name: "GroupOwnershipTransfers",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    GroupId = table.Column<Guid>(type: "uuid", nullable: false),
                    FromUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    ToUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    RequestedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    ExpiresAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    AcceptedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    CancelledAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    ExpiredAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GroupOwnershipTransfers", x => x.Id);
                    table.ForeignKey(
                        name: "FK_GroupOwnershipTransfers_Groups_GroupId",
                        column: x => x.GroupId,
                        principalTable: "Groups",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Memberships_GroupId",
                table: "Memberships",
                column: "GroupId");

            migrationBuilder.CreateIndex(
                name: "UX_Memberships_SingleOwner",
                table: "Memberships",
                column: "GroupId",
                unique: true,
                filter: "\"Role\" = 'Owner'");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Memberships_OwnerHasUser",
                table: "Memberships",
                sql: "\"Role\" <> 'Owner' OR \"UserId\" IS NOT NULL");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Memberships_Role",
                table: "Memberships",
                sql: "\"Role\" IN ('Owner', 'Admin', 'Member', 'Viewer')");

            migrationBuilder.CreateIndex(
                name: "UX_GroupOwnershipTransfers_Pending",
                table: "GroupOwnershipTransfers",
                column: "GroupId",
                unique: true,
                filter: "\"AcceptedAt\" IS NULL AND \"CancelledAt\" IS NULL AND \"ExpiredAt\" IS NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
            => throw new NotSupportedException("Owner consolidation changes access. Roll forward instead of restoring multiple Owners.");
    }
}

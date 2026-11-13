using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Sonivo.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddStripeBilling : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "CreationBlocked",
                table: "Groups",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateTable(
                name: "BillingAudit",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    OrganizationId = table.Column<Guid>(type: "uuid", nullable: false),
                    ActorUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    Action = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BillingAudit", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "BillingInbox",
                columns: table => new
                {
                    Id = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Environment = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    Type = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    CustomerId = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    SubscriptionId = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    ReceivedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    NextAttemptAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    ProcessedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    Attempts = table.Column<int>(type: "integer", nullable: false),
                    ErrorCode = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BillingInbox", x => new { x.Environment, x.Id });
                });

            migrationBuilder.CreateTable(
                name: "BillingOperations",
                columns: table => new
                {
                    Id = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    OrganizationId = table.Column<Guid>(type: "uuid", nullable: false),
                    Kind = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    Fingerprint = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Result = table.Column<string>(type: "character varying(4096)", maxLength: 4096, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BillingOperations", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "BillingOrganizations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    OwnerUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    PrimaryGroupId = table.Column<Guid>(type: "uuid", nullable: false),
                    Provider = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Environment = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    CustomerId = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    SubscriptionId = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    PlanId = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    Interval = table.Column<string>(type: "character varying(8)", maxLength: 8, nullable: false),
                    Status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    PeriodEndsAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    TrialEndsAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    PastDueSince = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    CancelAtPeriodEnd = table.Column<bool>(type: "boolean", nullable: false),
                    ExtraGroups = table.Column<int>(type: "integer", nullable: false),
                    ScheduledPlanId = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: true),
                    ScheduledInterval = table.Column<string>(type: "character varying(8)", maxLength: 8, nullable: true),
                    ScheduledExtraGroups = table.Column<int>(type: "integer", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Version = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BillingOrganizations", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "BillingTrials",
                columns: table => new
                {
                    OwnerUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    OrganizationId = table.Column<Guid>(type: "uuid", nullable: false),
                    StartedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    EndsAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BillingTrials", x => x.OwnerUserId);
                });

            migrationBuilder.CreateTable(
                name: "BillingGroups",
                columns: table => new
                {
                    GroupId = table.Column<Guid>(type: "uuid", nullable: false),
                    OrganizationId = table.Column<Guid>(type: "uuid", nullable: false),
                    LegacyPlanId = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: true),
                    LegacyGrantedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BillingGroups", x => x.GroupId);
                    table.ForeignKey(
                        name: "FK_BillingGroups_BillingOrganizations_OrganizationId",
                        column: x => x.OrganizationId,
                        principalTable: "BillingOrganizations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_BillingGroups_Groups_GroupId",
                        column: x => x.GroupId,
                        principalTable: "Groups",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_BillingAudit_OrganizationId_CreatedAt",
                table: "BillingAudit",
                columns: new[] { "OrganizationId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_BillingGroups_OrganizationId",
                table: "BillingGroups",
                column: "OrganizationId");

            migrationBuilder.CreateIndex(
                name: "IX_BillingInbox_ProcessedAt_NextAttemptAt",
                table: "BillingInbox",
                columns: new[] { "ProcessedAt", "NextAttemptAt" });

            migrationBuilder.CreateIndex(
                name: "IX_BillingOrganizations_Environment_CustomerId",
                table: "BillingOrganizations",
                columns: new[] { "Environment", "CustomerId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_BillingOrganizations_Environment_SubscriptionId",
                table: "BillingOrganizations",
                columns: new[] { "Environment", "SubscriptionId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_BillingOrganizations_OwnerUserId",
                table: "BillingOrganizations",
                column: "OwnerUserId");

            migrationBuilder.Sql("""
                DO $$ BEGIN
                    IF EXISTS (SELECT 1 FROM "Groups" g WHERE g."DeletedAt" IS NULL AND NOT EXISTS (
                        SELECT 1 FROM "Memberships" m WHERE m."GroupId" = g."Id" AND m."Role" = 'Owner'
                        AND m."UserId" IS NOT NULL AND m."AccessDisabledAt" IS NULL)) THEN
                        RAISE EXCEPTION 'Billing backfill requires an active Owner for every active Group';
                    END IF;
                END $$;
                INSERT INTO "BillingOrganizations" ("Id", "OwnerUserId", "PrimaryGroupId", "Provider", "Environment",
                    "PlanId", "Interval", "Status", "CancelAtPeriodEnd", "ExtraGroups", "CreatedAt", "UpdatedAt", "Version")
                SELECT g."Id", owner."UserId", g."Id", 'stripe', 'sandbox', 'starter', 'month', 'inactive', false, 0, now(), now(), 1
                FROM "Groups" g CROSS JOIN LATERAL (
                    SELECT m."UserId" FROM "Memberships" m WHERE m."GroupId" = g."Id" AND m."Role" = 'Owner'
                    AND m."UserId" IS NOT NULL AND m."AccessDisabledAt" IS NULL ORDER BY m."CreatedAt", m."Id" LIMIT 1
                ) owner WHERE g."DeletedAt" IS NULL ON CONFLICT ("Id") DO NOTHING;
                INSERT INTO "BillingGroups" ("GroupId", "OrganizationId", "LegacyPlanId", "LegacyGrantedAt")
                SELECT g."Id", g."Id", CASE WHEN g."PlanId" IN ('starter','pro','studio') THEN g."PlanId" ELSE 'starter' END, now()
                FROM "Groups" g WHERE g."DeletedAt" IS NULL ON CONFLICT ("GroupId") DO NOTHING;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                DO $$ BEGIN
                    IF EXISTS (SELECT 1 FROM "BillingOperations") OR EXISTS (SELECT 1 FROM "BillingInbox")
                        OR EXISTS (SELECT 1 FROM "BillingTrials") OR EXISTS (SELECT 1 FROM "BillingOrganizations" WHERE "CustomerId" IS NOT NULL) THEN
                        RAISE EXCEPTION 'Financial records exist; disable new commands instead of destructive rollback';
                    END IF;
                END $$;
                """);
            migrationBuilder.DropTable(
                name: "BillingAudit");

            migrationBuilder.DropTable(
                name: "BillingGroups");

            migrationBuilder.DropTable(
                name: "BillingInbox");

            migrationBuilder.DropTable(
                name: "BillingOperations");

            migrationBuilder.DropTable(
                name: "BillingTrials");

            migrationBuilder.DropTable(
                name: "BillingOrganizations");

            migrationBuilder.DropColumn(
                name: "CreationBlocked",
                table: "Groups");
        }
    }
}

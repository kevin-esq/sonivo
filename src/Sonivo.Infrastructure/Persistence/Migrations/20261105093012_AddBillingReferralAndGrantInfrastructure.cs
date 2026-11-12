using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Sonivo.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddBillingReferralAndGrantInfrastructure : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<long>(
                name: "AmountMinor",
                table: "BillingInbox",
                type: "bigint",
                nullable: false,
                defaultValue: 0L);

            migrationBuilder.AddColumn<string>(
                name: "Currency",
                table: "BillingInbox",
                type: "character varying(3)",
                maxLength: 3,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "EventAt",
                table: "BillingInbox",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTimeOffset(new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)));

            migrationBuilder.AddColumn<string>(
                name: "InvoiceId",
                table: "BillingInbox",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PaymentIntentId",
                table: "BillingInbox",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "PeriodEnd",
                table: "BillingInbox",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "PeriodStart",
                table: "BillingInbox",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "BillingAccessGrants",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    OperationId = table.Column<Guid>(type: "uuid", nullable: false),
                    RequestFingerprint = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    OrganizationId = table.Column<Guid>(type: "uuid", nullable: false),
                    PlanId = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    StartsAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    ExpiresAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Reason = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    GrantedByUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    RevokedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    RevokedByUserId = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BillingAccessGrants", x => x.Id);
                    table.ForeignKey(
                        name: "FK_BillingAccessGrants_BillingOrganizations_OrganizationId",
                        column: x => x.OrganizationId,
                        principalTable: "BillingOrganizations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "BillingAccountingOutbox",
                columns: table => new
                {
                    EventId = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Environment = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    OrganizationId = table.Column<Guid>(type: "uuid", nullable: false),
                    Payload = table.Column<string>(type: "character varying(16000)", maxLength: 16000, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    NextAttemptAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    DeliveredAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    Attempts = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BillingAccountingOutbox", x => new { x.Environment, x.EventId });
                    table.ForeignKey(
                        name: "FK_BillingAccountingOutbox_BillingOrganizations_OrganizationId",
                        column: x => x.OrganizationId,
                        principalTable: "BillingOrganizations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "BillingFinancialEvents",
                columns: table => new
                {
                    Environment = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    EventId = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    OrganizationId = table.Column<Guid>(type: "uuid", nullable: false),
                    EventType = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    SubscriptionId = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    InvoiceId = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    PaymentIntentId = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    RefundId = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    DisputeId = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    AmountMinor = table.Column<long>(type: "bigint", nullable: false),
                    Currency = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: false),
                    Status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    PeriodStart = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    PeriodEnd = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    EventAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    RecordedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BillingFinancialEvents", x => new { x.Environment, x.EventId });
                    table.ForeignKey(
                        name: "FK_BillingFinancialEvents_BillingOrganizations_OrganizationId",
                        column: x => x.OrganizationId,
                        principalTable: "BillingOrganizations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "BillingReferralAttributions",
                columns: table => new
                {
                    ReferredOrganizationId = table.Column<Guid>(type: "uuid", nullable: false),
                    ReferrerOrganizationId = table.Column<Guid>(type: "uuid", nullable: false),
                    Code = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    QualifiedInvoiceId = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    QualifiedEventId = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BillingReferralAttributions", x => x.ReferredOrganizationId);
                    table.ForeignKey(
                        name: "FK_BillingReferralAttributions_BillingOrganizations_ReferredOr~",
                        column: x => x.ReferredOrganizationId,
                        principalTable: "BillingOrganizations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_BillingReferralAttributions_BillingOrganizations_ReferrerOr~",
                        column: x => x.ReferrerOrganizationId,
                        principalTable: "BillingOrganizations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "BillingReferralCodes",
                columns: table => new
                {
                    OrganizationId = table.Column<Guid>(type: "uuid", nullable: false),
                    Environment = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    Code = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BillingReferralCodes", x => x.OrganizationId);
                    table.ForeignKey(
                        name: "FK_BillingReferralCodes_BillingOrganizations_OrganizationId",
                        column: x => x.OrganizationId,
                        principalTable: "BillingOrganizations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "BillingReferralRewards",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ReferrerOrganizationId = table.Column<Guid>(type: "uuid", nullable: false),
                    ReferredOrganizationId = table.Column<Guid>(type: "uuid", nullable: false),
                    Environment = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    InvoiceId = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    EventId = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Days = table.Column<int>(type: "integer", nullable: false),
                    Status = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    PendingReason = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    NextAttemptAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    AppliedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    FreeThrough = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    RewardBasePeriodEnd = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    TargetFreeThrough = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    ProcessingUntil = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    Attempts = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BillingReferralRewards", x => x.Id);
                    table.ForeignKey(
                        name: "FK_BillingReferralRewards_BillingOrganizations_ReferredOrganiz~",
                        column: x => x.ReferredOrganizationId,
                        principalTable: "BillingOrganizations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_BillingReferralRewards_BillingOrganizations_ReferrerOrganiz~",
                        column: x => x.ReferrerOrganizationId,
                        principalTable: "BillingOrganizations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_BillingAccessGrants_OperationId",
                table: "BillingAccessGrants",
                column: "OperationId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_BillingAccessGrants_OrganizationId_StartsAt_ExpiresAt_Revok~",
                table: "BillingAccessGrants",
                columns: new[] { "OrganizationId", "StartsAt", "ExpiresAt", "RevokedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_BillingAccountingOutbox_DeliveredAt_NextAttemptAt",
                table: "BillingAccountingOutbox",
                columns: new[] { "DeliveredAt", "NextAttemptAt" });

            migrationBuilder.CreateIndex(
                name: "IX_BillingAccountingOutbox_OrganizationId",
                table: "BillingAccountingOutbox",
                column: "OrganizationId");

            migrationBuilder.CreateIndex(
                name: "IX_BillingFinancialEvents_OrganizationId",
                table: "BillingFinancialEvents",
                column: "OrganizationId");

            migrationBuilder.CreateIndex(
                name: "IX_BillingReferralAttributions_QualifiedEventId",
                table: "BillingReferralAttributions",
                column: "QualifiedEventId",
                unique: true,
                filter: "\"QualifiedEventId\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_BillingReferralAttributions_QualifiedInvoiceId",
                table: "BillingReferralAttributions",
                column: "QualifiedInvoiceId",
                unique: true,
                filter: "\"QualifiedInvoiceId\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_BillingReferralAttributions_ReferrerOrganizationId",
                table: "BillingReferralAttributions",
                column: "ReferrerOrganizationId");

            migrationBuilder.CreateIndex(
                name: "IX_BillingReferralCodes_Environment_Code",
                table: "BillingReferralCodes",
                columns: new[] { "Environment", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_BillingReferralRewards_Environment_EventId",
                table: "BillingReferralRewards",
                columns: new[] { "Environment", "EventId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_BillingReferralRewards_Environment_InvoiceId",
                table: "BillingReferralRewards",
                columns: new[] { "Environment", "InvoiceId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_BillingReferralRewards_ReferredOrganizationId",
                table: "BillingReferralRewards",
                column: "ReferredOrganizationId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_BillingReferralRewards_ReferrerOrganizationId",
                table: "BillingReferralRewards",
                column: "ReferrerOrganizationId");

            migrationBuilder.CreateIndex(
                name: "IX_BillingReferralRewards_Status_NextAttemptAt",
                table: "BillingReferralRewards",
                columns: new[] { "Status", "NextAttemptAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "BillingAccessGrants");

            migrationBuilder.DropTable(
                name: "BillingAccountingOutbox");

            migrationBuilder.DropTable(
                name: "BillingFinancialEvents");

            migrationBuilder.DropTable(
                name: "BillingReferralAttributions");

            migrationBuilder.DropTable(
                name: "BillingReferralCodes");

            migrationBuilder.DropTable(
                name: "BillingReferralRewards");

            migrationBuilder.DropColumn(
                name: "AmountMinor",
                table: "BillingInbox");

            migrationBuilder.DropColumn(
                name: "Currency",
                table: "BillingInbox");

            migrationBuilder.DropColumn(
                name: "EventAt",
                table: "BillingInbox");

            migrationBuilder.DropColumn(
                name: "InvoiceId",
                table: "BillingInbox");

            migrationBuilder.DropColumn(
                name: "PaymentIntentId",
                table: "BillingInbox");

            migrationBuilder.DropColumn(
                name: "PeriodEnd",
                table: "BillingInbox");

            migrationBuilder.DropColumn(
                name: "PeriodStart",
                table: "BillingInbox");
        }
    }
}

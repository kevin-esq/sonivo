using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Sonivo.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class BillingAdministrationAndSuspension : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ActorServiceId",
                table: "BillingAudit",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "AssertedActorId",
                table: "BillingAudit",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "OperationId",
                table: "BillingAudit",
                type: "uuid",
                nullable: true);

            migrationBuilder.AlterColumn<Guid>(
                name: "GrantedByUserId",
                table: "BillingAccessGrants",
                type: "uuid",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uuid");

            migrationBuilder.AddColumn<string>(
                name: "GrantedByActorId",
                table: "BillingAccessGrants",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "GrantedByServiceId",
                table: "BillingAccessGrants",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "RevokedByActorId",
                table: "BillingAccessGrants",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "RevokedByServiceId",
                table: "BillingAccessGrants",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "BillingAdminOperations",
                columns: table => new
                {
                    Environment = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    OperationId = table.Column<Guid>(type: "uuid", nullable: false),
                    OrganizationId = table.Column<Guid>(type: "uuid", nullable: true),
                    RequestFingerprint = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    ServiceId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    AssertedActorId = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    ResultJson = table.Column<string>(type: "character varying(4096)", maxLength: 4096, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BillingAdminOperations", x => new { x.Environment, x.OperationId });
                });

            migrationBuilder.CreateTable(
                name: "BillingAdminRequestAudits",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Environment = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    KeyId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ServiceId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    AssertedActorId = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    OperationId = table.Column<Guid>(type: "uuid", nullable: false),
                    OrganizationId = table.Column<Guid>(type: "uuid", nullable: true),
                    Method = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    Path = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    OutcomeStatus = table.Column<int>(type: "integer", nullable: false),
                    StartedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CompletedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BillingAdminRequestAudits", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "BillingAdminRequestNonces",
                columns: table => new
                {
                    Environment = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    KeyId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Nonce = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    OrganizationId = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    ExpiresAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BillingAdminRequestNonces", x => new { x.Environment, x.KeyId, x.Nonce });
                });

            migrationBuilder.CreateTable(
                name: "BillingAdminSuspensions",
                columns: table => new
                {
                    OrganizationId = table.Column<Guid>(type: "uuid", nullable: false),
                    Environment = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    IsSuspended = table.Column<bool>(type: "boolean", nullable: false),
                    Reason = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    ServiceId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    AssertedActorId = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    ChangedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BillingAdminSuspensions", x => new { x.Environment, x.OrganizationId });
                    table.ForeignKey(
                        name: "FK_BillingAdminSuspensions_BillingOrganizations_OrganizationId",
                        column: x => x.OrganizationId,
                        principalTable: "BillingOrganizations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_BillingAdminOperations_Environment_OrganizationId_CreatedAt",
                table: "BillingAdminOperations",
                columns: new[] { "Environment", "OrganizationId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_BillingAdminRequestAudits_Environment_OrganizationId_Starte~",
                table: "BillingAdminRequestAudits",
                columns: new[] { "Environment", "OrganizationId", "StartedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_BillingAdminRequestAudits_OperationId",
                table: "BillingAdminRequestAudits",
                column: "OperationId");

            migrationBuilder.CreateIndex(
                name: "IX_BillingAdminRequestNonces_ExpiresAt",
                table: "BillingAdminRequestNonces",
                column: "ExpiresAt");

            migrationBuilder.CreateIndex(
                name: "IX_BillingAdminSuspensions_Environment_IsSuspended",
                table: "BillingAdminSuspensions",
                columns: new[] { "Environment", "IsSuspended" });

            migrationBuilder.CreateIndex(
                name: "IX_BillingAdminSuspensions_OrganizationId",
                table: "BillingAdminSuspensions",
                column: "OrganizationId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            throw new NotSupportedException("Billing administration records are security and audit history; roll back with a reviewed forward migration.");
        }
    }
}

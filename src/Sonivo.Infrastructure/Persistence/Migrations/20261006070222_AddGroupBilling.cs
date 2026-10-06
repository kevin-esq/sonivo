using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Sonivo.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddGroupBilling : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "BillingStatus",
                table: "Groups",
                type: "character varying(16)",
                maxLength: 16,
                nullable: false,
                defaultValue: "active");

            migrationBuilder.AddColumn<string>(
                name: "ScheduledPlanId",
                table: "Groups",
                type: "character varying(16)",
                maxLength: 16,
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "TrialEndsAt",
                table: "Groups",
                type: "timestamp with time zone",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "BillingStatus",
                table: "Groups");

            migrationBuilder.DropColumn(
                name: "ScheduledPlanId",
                table: "Groups");

            migrationBuilder.DropColumn(
                name: "TrialEndsAt",
                table: "Groups");
        }
    }
}

using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Sonivo.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class BillingOrgTrialAndDefaultPlan : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropPrimaryKey(
                name: "PK_BillingTrials",
                table: "BillingTrials");

            migrationBuilder.AlterColumn<string>(
                name: "PlanId",
                table: "Groups",
                type: "character varying(16)",
                maxLength: 16,
                nullable: false,
                defaultValue: "starter",
                oldClrType: typeof(string),
                oldType: "character varying(16)",
                oldMaxLength: 16,
                oldDefaultValue: "studio");

            migrationBuilder.AddPrimaryKey(
                name: "PK_BillingTrials",
                table: "BillingTrials",
                column: "OrganizationId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropPrimaryKey(
                name: "PK_BillingTrials",
                table: "BillingTrials");

            migrationBuilder.AlterColumn<string>(
                name: "PlanId",
                table: "Groups",
                type: "character varying(16)",
                maxLength: 16,
                nullable: false,
                defaultValue: "studio",
                oldClrType: typeof(string),
                oldType: "character varying(16)",
                oldMaxLength: 16,
                oldDefaultValue: "starter");

            migrationBuilder.AddPrimaryKey(
                name: "PK_BillingTrials",
                table: "BillingTrials",
                column: "OwnerUserId");
        }
    }
}

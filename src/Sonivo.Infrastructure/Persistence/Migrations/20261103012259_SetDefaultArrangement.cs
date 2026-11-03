using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Sonivo.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class SetDefaultArrangement : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "DefaultArrangementId",
                table: "Songs",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddUniqueConstraint(
                name: "AK_Arrangements_GroupId_SongId_Id",
                table: "Arrangements",
                columns: new[] { "GroupId", "SongId", "Id" });

            migrationBuilder.CreateIndex(
                name: "IX_Songs_GroupId_Id_DefaultArrangementId",
                table: "Songs",
                columns: new[] { "GroupId", "Id", "DefaultArrangementId" });

            migrationBuilder.Sql("""
                UPDATE "Songs" AS song
                SET "DefaultArrangementId" = (
                    SELECT arrangement."Id"
                    FROM "Arrangements" AS arrangement
                    WHERE arrangement."GroupId" = song."GroupId"
                      AND arrangement."SongId" = song."Id"
                      AND arrangement."DeletedAt" IS NULL
                    ORDER BY arrangement."CreatedAt", arrangement."Id"
                    LIMIT 1);
                """);

            migrationBuilder.AddForeignKey(
                name: "FK_Songs_Arrangements_GroupId_Id_DefaultArrangementId",
                table: "Songs",
                columns: new[] { "GroupId", "Id", "DefaultArrangementId" },
                principalTable: "Arrangements",
                principalColumns: new[] { "GroupId", "SongId", "Id" },
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Songs_Arrangements_GroupId_Id_DefaultArrangementId",
                table: "Songs");

            migrationBuilder.DropIndex(
                name: "IX_Songs_GroupId_Id_DefaultArrangementId",
                table: "Songs");

            migrationBuilder.DropUniqueConstraint(
                name: "AK_Arrangements_GroupId_SongId_Id",
                table: "Arrangements");


            migrationBuilder.DropColumn(
                name: "DefaultArrangementId",
                table: "Songs");
        }
    }
}

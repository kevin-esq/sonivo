using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Sonivo.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AlignRepertoireToAdr0024And0025 : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_Resources_Purpose",
                table: "Resources");

            migrationBuilder.AlterColumn<string>(
                name: "Title",
                table: "Songs",
                type: "character varying(200)",
                maxLength: 200,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "text");

            migrationBuilder.AlterColumn<string>(
                name: "RightsNotes",
                table: "Songs",
                type: "character varying(2000)",
                maxLength: 2000,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "text",
                oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "Attribution",
                table: "Songs",
                type: "character varying(300)",
                maxLength: 300,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "text",
                oldNullable: true);

            migrationBuilder.AddColumn<string>(
                name: "OriginKind",
                table: "Songs",
                type: "character varying(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "original");

            migrationBuilder.Sql(
                """
                UPDATE "Songs"
                SET "OriginKind" = CASE WHEN "IsOriginal" THEN 'original' ELSE 'cover' END;
                """);

            migrationBuilder.DropColumn(
                name: "IsOriginal",
                table: "Songs");

            migrationBuilder.DropColumn(
                name: "IsDefault",
                table: "Arrangements");

            migrationBuilder.AlterColumn<string>(
                name: "Purpose",
                table: "Resources",
                type: "character varying(32)",
                maxLength: 32,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "text");

            migrationBuilder.AlterColumn<string>(
                name: "ObjectKey",
                table: "Resources",
                type: "text",
                nullable: true,
                oldClrType: typeof(string),
                oldType: "text");

            migrationBuilder.AlterColumn<string>(
                name: "Note",
                table: "Resources",
                type: "character varying(2000)",
                maxLength: 2000,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "text",
                oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "ContentType",
                table: "Resources",
                type: "text",
                nullable: true,
                oldClrType: typeof(string),
                oldType: "text");

            migrationBuilder.AlterColumn<long>(
                name: "ByteSize",
                table: "Resources",
                type: "bigint",
                nullable: true,
                oldClrType: typeof(long),
                oldType: "bigint");

            migrationBuilder.AddColumn<string>(
                name: "Kind",
                table: "Resources",
                type: "character varying(16)",
                maxLength: 16,
                nullable: false,
                defaultValue: "file");

            migrationBuilder.AddColumn<string>(
                name: "Label",
                table: "Resources",
                type: "character varying(200)",
                maxLength: 200,
                nullable: false,
                defaultValue: "Resource");

            migrationBuilder.AddColumn<string>(
                name: "Part",
                table: "Resources",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Url",
                table: "Resources",
                type: "character varying(2000)",
                maxLength: 2000,
                nullable: true);

            migrationBuilder.Sql(
                """
                UPDATE "Resources"
                SET "Label" = COALESCE(NULLIF("OriginalFileName", ''), 'Resource')
                WHERE "Label" = 'Resource';
                """);

            migrationBuilder.AlterColumn<string>(
                name: "Label",
                table: "Arrangements",
                type: "character varying(200)",
                maxLength: 200,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "text");

            migrationBuilder.AlterColumn<string>(
                name: "DefaultKey",
                table: "Arrangements",
                type: "character varying(32)",
                maxLength: 32,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "text",
                oldNullable: true);

            migrationBuilder.AlterColumn<int>(
                name: "DefaultBpm",
                table: "Arrangements",
                type: "integer",
                nullable: true,
                oldClrType: typeof(decimal),
                oldType: "numeric(6,2)",
                oldPrecision: 6,
                oldScale: 2,
                oldNullable: true);

            migrationBuilder.AddCheckConstraint(
                name: "CK_Songs_OriginKind",
                table: "Songs",
                sql: "\"OriginKind\" IN ('original', 'cover', 'other')");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Resources_Kind",
                table: "Resources",
                sql: "\"Kind\" IN ('file', 'link')");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Resources_Purpose",
                table: "Resources",
                sql: "\"Purpose\" IN ('chart', 'lyrics', 'audio', 'click', 'reference', 'practice', 'other')");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_Songs_OriginKind",
                table: "Songs");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Resources_Kind",
                table: "Resources");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Resources_Purpose",
                table: "Resources");

            migrationBuilder.DropColumn(
                name: "OriginKind",
                table: "Songs");

            migrationBuilder.DropColumn(
                name: "Kind",
                table: "Resources");

            migrationBuilder.DropColumn(
                name: "Label",
                table: "Resources");

            migrationBuilder.DropColumn(
                name: "Part",
                table: "Resources");

            migrationBuilder.DropColumn(
                name: "Url",
                table: "Resources");

            migrationBuilder.AlterColumn<string>(
                name: "Title",
                table: "Songs",
                type: "text",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "character varying(200)",
                oldMaxLength: 200);

            migrationBuilder.AlterColumn<string>(
                name: "RightsNotes",
                table: "Songs",
                type: "text",
                nullable: true,
                oldClrType: typeof(string),
                oldType: "character varying(2000)",
                oldMaxLength: 2000,
                oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "Attribution",
                table: "Songs",
                type: "text",
                nullable: true,
                oldClrType: typeof(string),
                oldType: "character varying(300)",
                oldMaxLength: 300,
                oldNullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsOriginal",
                table: "Songs",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AlterColumn<string>(
                name: "Purpose",
                table: "Resources",
                type: "text",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "character varying(32)",
                oldMaxLength: 32);

            migrationBuilder.AlterColumn<string>(
                name: "ObjectKey",
                table: "Resources",
                type: "text",
                nullable: false,
                defaultValue: "",
                oldClrType: typeof(string),
                oldType: "text",
                oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "Note",
                table: "Resources",
                type: "text",
                nullable: true,
                oldClrType: typeof(string),
                oldType: "character varying(2000)",
                oldMaxLength: 2000,
                oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "ContentType",
                table: "Resources",
                type: "text",
                nullable: false,
                defaultValue: "",
                oldClrType: typeof(string),
                oldType: "text",
                oldNullable: true);

            migrationBuilder.AlterColumn<long>(
                name: "ByteSize",
                table: "Resources",
                type: "bigint",
                nullable: false,
                defaultValue: 0L,
                oldClrType: typeof(long),
                oldType: "bigint",
                oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "Label",
                table: "Arrangements",
                type: "text",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "character varying(200)",
                oldMaxLength: 200);

            migrationBuilder.AlterColumn<string>(
                name: "DefaultKey",
                table: "Arrangements",
                type: "text",
                nullable: true,
                oldClrType: typeof(string),
                oldType: "character varying(32)",
                oldMaxLength: 32,
                oldNullable: true);

            migrationBuilder.AlterColumn<decimal>(
                name: "DefaultBpm",
                table: "Arrangements",
                type: "numeric(6,2)",
                precision: 6,
                scale: 2,
                nullable: true,
                oldClrType: typeof(int),
                oldType: "integer",
                oldNullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsDefault",
                table: "Arrangements",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddCheckConstraint(
                name: "CK_Resources_Purpose",
                table: "Resources",
                sql: "\"Purpose\" IN ('chart', 'lyrics', 'audio', 'click', 'reference', 'other')");
        }
    }
}

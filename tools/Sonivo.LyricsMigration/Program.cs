using System.Text.Json;
using Npgsql;
using Sonivo.Application.Abstractions;
using Sonivo.Application.Repertoire;

var restorePath = ReadOption(args, "--restore");
var apply = args.Contains("--apply", StringComparer.Ordinal);
if (restorePath is not null && apply)
{
    Console.Error.WriteLine("Choose either --restore or --apply.");
    return 2;
}

await using var connection = new NpgsqlConnection(
    Environment.GetEnvironmentVariable("SONIVO_MIGRATION_CONNECTION") ?? ReadDevelopmentConnection());
await connection.OpenAsync();
if (restorePath is not null)
    return await RestoreAsync(connection, restorePath);
var candidates = await ReadCandidatesAsync(connection);
var ready = new List<(MigrationRecord Record, LrcConversion Conversion)>();
var skipped = 0;
foreach (var record in candidates)
{
    try
    {
        var conversion = RawTtmlLyrics.ConvertIfPresent(record.Lyrics)
            ?? RawTtmlLyrics.ConvertIfPresent(record.Chords);
        if (conversion is null)
        {
            skipped++;
            Console.WriteLine($"SKIP {record.Id}: no TTML document detected");
            continue;
        }
        ChordTimingJsonNormalizer.ValidateWordReferences(conversion.ChordTimingJson, conversion.Lyrics);
        ready.Add((record, conversion));
        Console.WriteLine($"READY {record.Id}: {conversion.MarkCount} timing marks, {conversion.WordCount} word marks");
    }
    catch (Exception exception) when (exception is ValidationException or ArgumentException)
    {
        skipped++;
        Console.WriteLine($"SKIP {record.Id}: TTML could not be safely converted");
    }
}

Console.WriteLine($"Candidates: {candidates.Count}; ready: {ready.Count}; skipped: {skipped}.");
if (!apply)
{
    Console.WriteLine("Dry run only. Pass --apply to back up and migrate ready arrangements.");
    return 0;
}
if (ready.Count == 0) return 0;

var backupPath = ReadOption(args, "--backup") ?? Path.Combine(
    Directory.GetCurrentDirectory(), ".scratch", $"lyrics-ttml-backup-{DateTimeOffset.UtcNow:yyyyMMddHHmmss}.json");
Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(backupPath))!);
await File.WriteAllTextAsync(backupPath, JsonSerializer.Serialize(
    ready.Select(item => item.Record).ToArray(), MigrationJson.Options));

await using (var transaction = await connection.BeginTransactionAsync())
{
    foreach (var (record, conversion) in ready)
    {
        await using var command = new NpgsqlCommand("""
            UPDATE "Arrangements"
            SET "Lyrics" = @lyrics, "Chords" = @chords, "ChordTimingJson" = @timing,
                "UpdatedAt" = @updatedAt, "Version" = "Version" + 1
            WHERE "Id" = @id AND "Version" = @version AND "DeletedAt" IS NULL
            """, connection, transaction);
        command.Parameters.AddWithValue("lyrics", conversion.Lyrics);
        command.Parameters.AddWithValue("chords", conversion.Lyrics);
        command.Parameters.AddWithValue("timing", conversion.ChordTimingJson);
        command.Parameters.AddWithValue("updatedAt", DateTimeOffset.UtcNow);
        command.Parameters.AddWithValue("id", record.Id);
        command.Parameters.AddWithValue("version", record.Version);
        if (await command.ExecuteNonQueryAsync() != 1)
            throw new InvalidOperationException($"Arrangement {record.Id} changed during migration; transaction aborted.");
    }
    await transaction.CommitAsync();
}

Console.WriteLine($"Migrated {ready.Count} arrangements. Backup: {Path.GetFullPath(backupPath)}");
return 0;

static async Task<List<MigrationRecord>> ReadCandidatesAsync(NpgsqlConnection connection)
{
    await using var command = new NpgsqlCommand("""
        SELECT "Id", "Label", "Lyrics", "Chords", "ChordTimingJson", "UpdatedAt", "Version"
        FROM "Arrangements"
        WHERE "DeletedAt" IS NULL AND (
          regexp_replace(replace(COALESCE("Lyrics", ''), chr(65279), ''), '^[[:space:]]+', '') LIKE '<tt%' OR
          regexp_replace(replace(COALESCE("Lyrics", ''), chr(65279), ''), '^[[:space:]]+', '') LIKE '<?xml%' OR
          regexp_replace(replace(COALESCE("Chords", ''), chr(65279), ''), '^[[:space:]]+', '') LIKE '<tt%' OR
          regexp_replace(replace(COALESCE("Chords", ''), chr(65279), ''), '^[[:space:]]+', '') LIKE '<?xml%'
        )
        ORDER BY "Id"
        """, connection);
    var records = new List<MigrationRecord>();
    await using var reader = await command.ExecuteReaderAsync();
    while (await reader.ReadAsync())
    {
        records.Add(new(
            reader.GetGuid(0),
            reader.GetString(1),
            reader.IsDBNull(2) ? null : reader.GetString(2),
            reader.IsDBNull(3) ? null : reader.GetString(3),
            reader.IsDBNull(4) ? null : reader.GetString(4),
            reader.GetFieldValue<DateTimeOffset>(5),
            reader.GetInt32(6)));
    }
    return records;
}

static async Task<int> RestoreAsync(NpgsqlConnection connection, string path)
{
    MigrationRecord[] records;
    try
    {
        records = JsonSerializer.Deserialize<MigrationRecord[]>(await File.ReadAllTextAsync(path), MigrationJson.Options) ?? [];
    }
    catch (Exception exception) when (exception is IOException or JsonException)
    {
        Console.Error.WriteLine("Backup file cannot be read.");
        return 2;
    }

    await using var transaction = await connection.BeginTransactionAsync();
    foreach (var record in records)
    {
        await using var command = new NpgsqlCommand("""
            UPDATE "Arrangements"
            SET "Lyrics" = @lyrics, "Chords" = @chords, "ChordTimingJson" = @timing,
                "UpdatedAt" = @updatedAt, "Version" = @version
            WHERE "Id" = @id AND "Version" = @migratedVersion
            """, connection, transaction);
        command.Parameters.AddWithValue("lyrics", (object?)record.Lyrics ?? DBNull.Value);
        command.Parameters.AddWithValue("chords", (object?)record.Chords ?? DBNull.Value);
        command.Parameters.AddWithValue("timing", (object?)record.ChordTimingJson ?? DBNull.Value);
        command.Parameters.AddWithValue("updatedAt", record.UpdatedAt);
        command.Parameters.AddWithValue("version", record.Version);
        command.Parameters.AddWithValue("id", record.Id);
        command.Parameters.AddWithValue("migratedVersion", record.Version + 1);
        if (await command.ExecuteNonQueryAsync() != 1)
        {
            Console.Error.WriteLine($"Restore stopped: {record.Id} changed after migration; transaction rolled back.");
            await transaction.RollbackAsync();
            return 2;
        }
    }
    await transaction.CommitAsync();
    Console.WriteLine($"Restored {records.Length} arrangements from {Path.GetFullPath(path)}");
    return 0;
}

static string ReadDevelopmentConnection()
{
    var path = Path.Combine(Directory.GetCurrentDirectory(), "src", "Sonivo.Api", "appsettings.Development.json");
    using var document = JsonDocument.Parse(File.ReadAllText(path));
    return document.RootElement.GetProperty("ConnectionStrings").GetProperty("Default").GetString()
        ?? throw new InvalidOperationException("Development database connection is missing.");
}

static string? ReadOption(string[] arguments, string name)
{
    var index = Array.IndexOf(arguments, name);
    return index >= 0 && index + 1 < arguments.Length ? arguments[index + 1] : null;
}

sealed record MigrationRecord(
    Guid Id,
    string Label,
    string? Lyrics,
    string? Chords,
    string? ChordTimingJson,
    DateTimeOffset UpdatedAt,
    int Version);

static class MigrationJson
{
    public static JsonSerializerOptions Options { get; } = new(JsonSerializerDefaults.Web) { WriteIndented = true };
}

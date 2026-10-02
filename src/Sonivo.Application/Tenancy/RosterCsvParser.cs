using System.Text;
using Sonivo.Application.Abstractions;

namespace Sonivo.Application.Tenancy;

/// <summary>A parsed CSV row with its 1-based data-row number (header excluded).</summary>
public sealed record RosterCsvRow(int RowNumber, string? DisplayName, string? Email, string? Handle);

public sealed record RosterCsvParseResult(IReadOnlyList<RosterCsvRow> Rows);

/// <summary>
/// Strict CSV parser for roster bulk add (phase 4.1). Header must include
/// <c>displayName</c> and may include <c>email</c> and <c>handle</c>; unknown
/// columns are rejected. Supports quoted fields with escaped quotes, CRLF/LF.
/// </summary>
public static class RosterCsvParser
{
    public const int MaxRows = 200;

    private static readonly HashSet<string> AllowedHeaders =
        new(StringComparer.OrdinalIgnoreCase) { "displayname", "email", "handle" };

    public static RosterCsvParseResult Parse(string? csv)
    {
        if (string.IsNullOrWhiteSpace(csv))
        {
            throw new ValidationException("El CSV está vacío.");
        }

        var records = SplitRecords(csv);
        if (records.Count == 0)
        {
            throw new ValidationException("El CSV está vacío.");
        }

        var header = records[0];
        var columns = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        for (var i = 0; i < header.Count; i++)
        {
            var name = header[i].Trim();
            if (name.Length == 0)
            {
                continue;
            }

            if (!AllowedHeaders.Contains(name))
            {
                throw new ValidationException($"Columna no permitida: '{name}'.");
            }

            if (!columns.TryAdd(name, i))
            {
                throw new ValidationException($"Columna duplicada: '{name}'.");
            }
        }

        if (!columns.ContainsKey("displayname"))
        {
            throw new ValidationException("Falta la columna 'displayName'.");
        }

        var dataRecords = records.Skip(1).ToList();
        if (dataRecords.Count == 0)
        {
            throw new ValidationException("El CSV no contiene filas de datos.");
        }

        if (dataRecords.Count > MaxRows)
        {
            throw new ValidationException($"El CSV supera el máximo de {MaxRows} filas.");
        }

        var rows = new List<RosterCsvRow>(dataRecords.Count);
        for (var i = 0; i < dataRecords.Count; i++)
        {
            var record = dataRecords[i];
            rows.Add(new RosterCsvRow(
                i + 1,
                Field(record, columns, "displayname"),
                Field(record, columns, "email"),
                Field(record, columns, "handle")));
        }

        return new RosterCsvParseResult(rows);
    }

    private static string? Field(IReadOnlyList<string> record, IReadOnlyDictionary<string, int> columns, string name)
    {
        if (!columns.TryGetValue(name, out var index) || index >= record.Count)
        {
            return null;
        }

        return record[index].Trim();
    }

    private static List<List<string>> SplitRecords(string csv)
    {
        var records = new List<List<string>>();
        var current = new List<string>();
        var field = new StringBuilder();
        var inQuotes = false;

        for (var i = 0; i < csv.Length; i++)
        {
            var c = csv[i];
            if (inQuotes)
            {
                if (c == '"')
                {
                    if (i + 1 < csv.Length && csv[i + 1] == '"')
                    {
                        field.Append('"');
                        i++;
                    }
                    else
                    {
                        inQuotes = false;
                    }
                }
                else
                {
                    field.Append(c);
                }

                continue;
            }

            switch (c)
            {
                case '"':
                    inQuotes = true;
                    break;
                case ',':
                    current.Add(field.ToString());
                    field.Clear();
                    break;
                case '\r':
                    break;
                case '\n':
                    current.Add(field.ToString());
                    field.Clear();
                    records.Add(current);
                    current = new List<string>();
                    break;
                default:
                    field.Append(c);
                    break;
            }
        }

        if (inQuotes)
        {
            throw new ValidationException("El CSV tiene comillas sin cerrar.");
        }

        if (field.Length > 0 || current.Count > 0)
        {
            current.Add(field.ToString());
            records.Add(current);
        }

        return records;
    }
}

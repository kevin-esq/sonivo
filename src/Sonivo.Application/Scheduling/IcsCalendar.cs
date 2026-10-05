using System.Globalization;
using System.Text;
using Sonivo.Domain.Scheduling;

namespace Sonivo.Application.Scheduling;

/// <summary>
/// ADR-0052: minimal, read-only iCalendar (RFC 5545) feed for a group's upcoming
/// events. No attendees, no alarms, no VTIMEZONE (UTC instants only) — the thin
/// feed the phase asks for.
/// </summary>
public static class IcsCalendar
{
    public static string Build(string groupName, IReadOnlyList<Event> events, DateTimeOffset now)
    {
        var builder = new StringBuilder();
        Append(builder, "BEGIN:VCALENDAR");
        Append(builder, "VERSION:2.0");
        Append(builder, "PRODID:-//Sonivo//Sonivo//ES");
        Append(builder, "CALSCALE:GREGORIAN");
        Append(builder, "METHOD:PUBLISH");
        Append(builder, "X-WR-CALNAME:" + Escape(groupName));

        foreach (var musicalEvent in events)
        {
            Append(builder, "BEGIN:VEVENT");
            Append(builder, $"UID:{musicalEvent.Id:D}@sonivo");
            Append(builder, $"DTSTAMP:{Format(now)}");
            Append(builder, $"DTSTART:{Format(musicalEvent.StartsAt)}");
            Append(builder, "SUMMARY:" + Escape(musicalEvent.Title));
            Append(builder, "END:VEVENT");
        }

        Append(builder, "END:VCALENDAR");
        return builder.ToString();
    }

    private static void Append(StringBuilder builder, string line) => builder.Append(line).Append("\r\n");

    private static string Format(DateTimeOffset value) =>
        value.ToUniversalTime().ToString("yyyyMMdd'T'HHmmss'Z'", CultureInfo.InvariantCulture);

    private static string Escape(string value) => value
        .Replace("\\", "\\\\", StringComparison.Ordinal)
        .Replace(";", "\\;", StringComparison.Ordinal)
        .Replace(",", "\\,", StringComparison.Ordinal)
        .Replace("\r\n", "\\n", StringComparison.Ordinal)
        .Replace("\n", "\\n", StringComparison.Ordinal)
        // SECURITY-AUDIT-2026-10 (B12): a lone \r must not survive as a raw
        // line break (property injection).
        .Replace("\r", "\\n", StringComparison.Ordinal);
}

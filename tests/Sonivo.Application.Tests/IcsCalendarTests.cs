using Sonivo.Application.Scheduling;
using Sonivo.Domain.Scheduling;

namespace Sonivo.Application.Tests;

/// <summary>
/// SECURITY-AUDIT-2026-10 (B12): the ICS feed must escape RFC 5545 TEXT
/// delimiters so hostile group/event names cannot inject calendar properties.
/// </summary>
public class IcsCalendarTests
{
    [Fact]
    public void Hostile_titles_cannot_inject_ics_properties()
    {
        var now = new DateTimeOffset(2026, 10, 5, 12, 0, 0, TimeSpan.Zero);
        var hostile = "Título, malvado; con\r\nsalto\nEXTRA:injectado\rfin";
        var calendar = IcsCalendar.Build(
            "Grupo, prueba; x",
            new[]
            {
                Event.Create(
                    Guid.NewGuid(),
                    hostile,
                    EventTypes.Rehearsal,
                    now.AddDays(1),
                    now)
            },
            now);

        // No raw CR/LF survives inside a property value, and the injected
        // pseudo-property never becomes a real line of its own.
        var lines = calendar.Split("\r\n", StringSplitOptions.RemoveEmptyEntries);
        var summary = lines.Single(l => l.StartsWith("SUMMARY:", StringComparison.Ordinal));
        Assert.DoesNotContain("\n", summary.Replace("\\n", string.Empty, StringComparison.Ordinal));
        Assert.DoesNotContain("\r", summary);
        Assert.DoesNotContain(lines, l => l.StartsWith("EXTRA:", StringComparison.Ordinal));

        // Delimiters are escaped, so the parsed summary remains one property.
        Assert.Contains("\\,", summary, StringComparison.Ordinal);
        Assert.Contains("\\;", summary, StringComparison.Ordinal);
        Assert.Contains("\\n", summary, StringComparison.Ordinal);

        // The calendar name is escaped the same way.
        var calName = lines.Single(l => l.StartsWith("X-WR-CALNAME:", StringComparison.Ordinal));
        Assert.Contains("\\,", calName, StringComparison.Ordinal);
        Assert.Contains("\\;", calName, StringComparison.Ordinal);
    }

    [Fact]
    public void Ordinary_names_round_trip_untouched()
    {
        var now = new DateTimeOffset(2026, 10, 5, 12, 0, 0, TimeSpan.Zero);
        var calendar = IcsCalendar.Build(
            "Banda Ensayo",
            new[]
            {
                Event.Create(
                    Guid.NewGuid(),
                    "Ensayo general",
                    EventTypes.Rehearsal,
                    now.AddHours(2),
                    now)
            },
            now);

        Assert.Contains("SUMMARY:Ensayo general", calendar, StringComparison.Ordinal);
        Assert.Contains("X-WR-CALNAME:Banda Ensayo", calendar, StringComparison.Ordinal);
    }
}

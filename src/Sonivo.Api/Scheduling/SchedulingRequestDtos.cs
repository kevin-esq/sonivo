internal sealed record CreateSetlistRequest(string? Name);
internal sealed record UpdateSetlistRequest(string? Name, int ExpectedVersion);
internal sealed record ReplaceSetlistItemsRequest(
    int ExpectedVersion,
    IReadOnlyList<ReplaceSetlistItemRequest>? Items);
internal sealed record ReplaceSetlistItemRequest(Guid ArrangementId, int SortOrder);
internal sealed record CreateEventRequest(string? Title, string? Type, DateTimeOffset StartsAt);
internal sealed record UpdateEventRequest(
    string? Title,
    string? Type,
    DateTimeOffset? StartsAt,
    int ExpectedVersion);
internal sealed record CancelEventRequest(int ExpectedVersion);
internal sealed record DuplicateEventRequest(int ExpectedVersion);
internal sealed record ApplySetlistRequest(Guid SetlistId, int ExpectedVersion, bool ConfirmReplace = false);
internal sealed record UpsertEventRsvpRequest(string? Response);

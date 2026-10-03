using Microsoft.AspNetCore.Identity;

namespace Sonivo.Infrastructure.Identity;

public sealed class ApplicationUser : IdentityUser<Guid>
{
    public string? DisplayName { get; set; }

    /// <summary>
    /// Set only for accounts created (provisioned) by a group. Only that group's
    /// Owner may reset such an account; the mark is cleared when the person joins
    /// another group, links an external login, registers a passkey, resets via a
    /// verified email or claims the account (ADR-0047).
    /// </summary>
    public Guid? ManagedByGroupId { get; set; }

    /// <summary>
    /// When true the API blocks everything except me / logout / change-password
    /// until the temporary credential is replaced (ADR-0047).
    /// </summary>
    public bool MustChangePassword { get; set; }

    /// <summary>
    /// ADR-0055 W-E: last presence heartbeat (best-effort, never authorizes).
    /// </summary>
    public DateTimeOffset? LastSeenAt { get; set; }
}

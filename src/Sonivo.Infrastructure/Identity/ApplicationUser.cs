using Microsoft.AspNetCore.Identity;

namespace Sonivo.Infrastructure.Identity;

public sealed class ApplicationUser : IdentityUser<Guid>
{
    public string? DisplayName { get; set; }
}

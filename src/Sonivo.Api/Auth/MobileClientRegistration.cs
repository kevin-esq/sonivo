using OpenIddict.Abstractions;

namespace Sonivo.Api.Auth;

internal static class MobileClientRegistration
{
    private static readonly (string ClientId, string DisplayName, string RedirectUri)[] Clients =
    [
        ("sonivo-android", "Sonivo Android", "lat.sonivo.android:/oauth2redirect"),
        ("sonivo-ios", "Sonivo iOS", "lat.sonivo.ios:/oauth2redirect")
    ];

    public static async Task RegisterAsync(IServiceProvider services, CancellationToken cancellationToken = default)
    {
        var manager = services.GetRequiredService<IOpenIddictApplicationManager>();

        foreach (var client in Clients)
        {
            var descriptor = new OpenIddictApplicationDescriptor
            {
                ApplicationType = OpenIddictConstants.ApplicationTypes.Native,
                ClientId = client.ClientId,
                ClientType = OpenIddictConstants.ClientTypes.Public,
                ConsentType = OpenIddictConstants.ConsentTypes.Implicit,
                DisplayName = client.DisplayName
            };
            descriptor.RedirectUris.Add(new Uri(client.RedirectUri));
            descriptor.Permissions.Add(OpenIddictConstants.Permissions.Endpoints.Authorization);
            descriptor.Permissions.Add(OpenIddictConstants.Permissions.Endpoints.Token);
            descriptor.Permissions.Add(OpenIddictConstants.Permissions.Endpoints.Revocation);
            descriptor.Permissions.Add(OpenIddictConstants.Permissions.GrantTypes.AuthorizationCode);
            descriptor.Permissions.Add(OpenIddictConstants.Permissions.GrantTypes.RefreshToken);
            descriptor.Permissions.Add(OpenIddictConstants.Permissions.ResponseTypes.Code);
            descriptor.Permissions.Add(OpenIddictConstants.Permissions.Scopes.Profile);
            descriptor.Permissions.Add(OpenIddictConstants.Permissions.Scopes.Email);
            descriptor.Permissions.Add(OpenIddictConstants.Permissions.Prefixes.Scope + OpenIddictConstants.Scopes.OfflineAccess);
            descriptor.Permissions.Add(OpenIddictConstants.Permissions.Prefixes.Scope + "sonivo_api");
            descriptor.Requirements.Add(OpenIddictConstants.Requirements.Features.ProofKeyForCodeExchange);

            var existing = await manager.FindByClientIdAsync(client.ClientId, cancellationToken);
            if (existing is null)
            {
                await manager.CreateAsync(descriptor, cancellationToken);
            }
            else
            {
                await manager.UpdateAsync(existing, descriptor, cancellationToken);
            }
        }
    }
}

using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Sonivo.Domain.Tenancy;
using Sonivo.Infrastructure.Identity;
using Sonivo.Infrastructure.Persistence;

namespace Sonivo.Api.Tests;

public class InvitationApiTests : IClassFixture<SonivoApiFactory>
{
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };
    private readonly SonivoApiFactory _factory;

    public InvitationApiTests(SonivoApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task Anonymous_create_and_accept_return_401()
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        await EnsureCsrfAsync(client);

        var create = await client.PostAsJsonAsync($"/api/groups/{Guid.NewGuid()}/invitations", new { });
        Assert.Equal(HttpStatusCode.Unauthorized, create.StatusCode);

        var accept = await client.PostAsJsonAsync($"/api/invitations/{Guid.NewGuid():N}/accept", new { });
        Assert.Equal(HttpStatusCode.Unauthorized, accept.StatusCode);
    }

    [Fact]
    public async Task Owner_create_returns_201_with_token()
    {
        var client = await CreateAuthenticatedClientAsync("invite-owner@example.com");
        var group = await CreateGroupAsync(client, "Invite Band");

        var create = await client.PostAsJsonAsync($"/api/groups/{group.Id}/invitations", new { });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        var created = await create.Content.ReadFromJsonAsync<InvitationCreatedResponse>(JsonOptions);
        Assert.NotNull(created);
        Assert.NotEqual(Guid.Empty, created.Id);
        Assert.False(string.IsNullOrWhiteSpace(created.Token));
        Assert.False(created.Emailed);
        Assert.True(created.ExpiresAt > DateTimeOffset.UtcNow);
        Assert.True(created.ExpiresAt <= DateTimeOffset.UtcNow.AddDays(7).AddMinutes(1));
    }

    [Fact]
    public async Task Owner_create_with_email_when_unconfigured_returns_201_emailed_false()
    {
        var client = await CreateAuthenticatedClientAsync("invite-email-owner@example.com");
        var group = await CreateGroupAsync(client, "Email Band");

        var create = await client.PostAsJsonAsync(
            $"/api/groups/{group.Id}/invitations",
            new { email = "singer@example.com" });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        var created = await create.Content.ReadFromJsonAsync<InvitationCreatedResponse>(JsonOptions);
        Assert.NotNull(created);
        Assert.False(string.IsNullOrWhiteSpace(created.Token));
        Assert.False(created.Emailed);
    }

    [Fact]
    public async Task Owner_create_with_invalid_email_returns_400()
    {
        var client = await CreateAuthenticatedClientAsync("invite-bad-email@example.com");
        var group = await CreateGroupAsync(client, "Bad Email Band");

        var create = await client.PostAsJsonAsync(
            $"/api/groups/{group.Id}/invitations",
            new { email = "not-an-email" });
        Assert.Equal(HttpStatusCode.BadRequest, create.StatusCode);

        var list = await client.GetAsync($"/api/groups/{group.Id}/invitations");
        var payload = await list.Content.ReadFromJsonAsync<InvitationListResponse>(JsonOptions);
        Assert.NotNull(payload);
        Assert.Empty(payload.Items);
    }

    [Fact]
    public async Task Member_create_returns_403()
    {
        var ownerId = Guid.NewGuid();
        var memberId = Guid.NewGuid();
        var groupId = Guid.NewGuid();
        await SeedUsersAndMembershipAsync(
            ("invite-own@example.com", "Password1", ownerId),
            ("invite-mem@example.com", "Password1", memberId),
            groupId,
            "Shared Invites",
            ownerId,
            memberId);

        var memberClient = await CreateAuthenticatedClientAsync("invite-mem@example.com");
        var create = await memberClient.PostAsJsonAsync($"/api/groups/{groupId}/invitations", new { });
        Assert.Equal(HttpStatusCode.Forbidden, create.StatusCode);
    }

    [Fact]
    public async Task Accept_returns_200_with_group_id_and_member_role()
    {
        var ownerClient = await CreateAuthenticatedClientAsync("invite-create@example.com");
        var group = await CreateGroupAsync(ownerClient, "Join Band");
        var create = await ownerClient.PostAsJsonAsync($"/api/groups/{group.Id}/invitations", new { });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        var invitation = await create.Content.ReadFromJsonAsync<InvitationCreatedResponse>(JsonOptions);
        Assert.NotNull(invitation);

        var invitee = await CreateAuthenticatedClientAsync("invite-join@example.com");
        var accept = await invitee.PostAsJsonAsync($"/api/invitations/{invitation.Token}/accept", new { });
        Assert.Equal(HttpStatusCode.OK, accept.StatusCode);
        var accepted = await accept.Content.ReadFromJsonAsync<InvitationAcceptedResponse>(JsonOptions);
        Assert.NotNull(accepted);
        Assert.Equal(group.Id, accepted.GroupId);
        Assert.Equal(MembershipRoles.Member, accepted.Role);

        var get = await invitee.GetAsync($"/api/groups/{group.Id}");
        Assert.Equal(HttpStatusCode.OK, get.StatusCode);
    }

    [Fact]
    public async Task Owner_lists_outstanding_then_revoke_makes_accept_400()
    {
        var owner = await CreateAuthenticatedClientAsync("inv-hygiene-own@example.com");
        var group = await CreateGroupAsync(owner, "Hygiene Band");
        var create = await owner.PostAsJsonAsync($"/api/groups/{group.Id}/invitations", new { });
        var created = await create.Content.ReadFromJsonAsync<InvitationCreatedResponse>(JsonOptions);
        Assert.NotNull(created);

        var list = await owner.GetAsync($"/api/groups/{group.Id}/invitations");
        Assert.Equal(HttpStatusCode.OK, list.StatusCode);
        var payload = await list.Content.ReadFromJsonAsync<InvitationListResponse>(JsonOptions);
        Assert.NotNull(payload);
        Assert.Single(payload.Items);
        Assert.Equal(created.Id, payload.Items[0].Id);

        var revoke = await owner.DeleteAsync($"/api/groups/{group.Id}/invitations/{created.Id}");
        Assert.Equal(HttpStatusCode.NoContent, revoke.StatusCode);

        var empty = await owner.GetAsync($"/api/groups/{group.Id}/invitations");
        var emptyPayload = await empty.Content.ReadFromJsonAsync<InvitationListResponse>(JsonOptions);
        Assert.NotNull(emptyPayload);
        Assert.Empty(emptyPayload.Items);

        var invitee = await CreateAuthenticatedClientAsync("inv-hygiene-join@example.com");
        var accept = await invitee.PostAsJsonAsync($"/api/invitations/{created.Token}/accept", new { });
        Assert.Equal(HttpStatusCode.BadRequest, accept.StatusCode);
    }

    [Fact]
    public async Task Member_list_invitations_returns_403()
    {
        var owner = await CreateAuthenticatedClientAsync("inv-hygiene-o2@example.com");
        var group = await CreateGroupAsync(owner, "Authz Invites");
        var invite = await owner.PostAsJsonAsync($"/api/groups/{group.Id}/invitations", new { });
        var created = await invite.Content.ReadFromJsonAsync<InvitationCreatedResponse>(JsonOptions);
        var member = await CreateAuthenticatedClientAsync("inv-hygiene-m2@example.com");
        await member.PostAsJsonAsync($"/api/invitations/{created!.Token}/accept", new { });

        var list = await member.GetAsync($"/api/groups/{group.Id}/invitations");
        Assert.Equal(HttpStatusCode.Forbidden, list.StatusCode);
    }

    private async Task<HttpClient> CreateAuthenticatedClientAsync(string email, string password = "Password1")
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false,
            HandleCookies = true
        });
        await EnsureCsrfAsync(client);

        var register = await client.PostAsJsonAsync("/api/auth/register", new
        {
            email,
            password,
            displayName = email
        });
        if (register.StatusCode is not (HttpStatusCode.Created or HttpStatusCode.Conflict))
        {
            var body = await register.Content.ReadAsStringAsync();
            throw new InvalidOperationException($"Register failed: {(int)register.StatusCode} {body}");
        }

        // T-AU-01: mailbox must be proven before the login gate passes.
        await AuthTestHelper.ConfirmEmailAsync(_factory.Services, email);
        await EnsureCsrfAsync(client);
        var login = await client.PostAsJsonAsync("/api/auth/login", new
        {
            email,
            password,
            rememberMe = false
        });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        await EnsureCsrfAsync(client);
        return client;
    }

    private static async Task<GroupResponse> CreateGroupAsync(HttpClient client, string name)
    {
        var create = await client.PostAsJsonAsync("/api/groups", new { name });
        create.EnsureSuccessStatusCode();
        var group = await create.Content.ReadFromJsonAsync<GroupResponse>(JsonOptions);
        return group ?? throw new InvalidOperationException("Missing group response");
    }

    private async Task SeedUsersAndMembershipAsync(
        (string Email, string Password, Guid Id) owner,
        (string Email, string Password, Guid Id) member,
        Guid groupId,
        string groupName,
        Guid ownerId,
        Guid memberId)
    {
        using var scope = _factory.Services.CreateScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var db = scope.ServiceProvider.GetRequiredService<SonivoDbContext>();

        await EnsureUserAsync(users, owner.Email, owner.Password, owner.Id);
        await EnsureUserAsync(users, member.Email, member.Password, member.Id);

        var now = DateTimeOffset.UtcNow;
        if (!await db.Groups.IgnoreQueryFilters().AnyAsync(g => g.Id == groupId))
        {
            await db.Groups.AddAsync(Group.Create(groupName, now, groupId));
            await db.Memberships.AddAsync(Membership.CreateOwner(groupId, ownerId, now));
            await db.Memberships.AddAsync(Membership.CreateMember(groupId, memberId, now));
            await db.SaveChangesAsync();
        }
    }

    private static async Task EnsureUserAsync(
        UserManager<ApplicationUser> users,
        string email,
        string password,
        Guid id)
    {
        var existing = await users.FindByEmailAsync(email);
        if (existing is not null)
        {
            return;
        }

        var user = new ApplicationUser
        {
            Id = id,
            Email = email,
            UserName = email,
            DisplayName = email
        };
        var result = await users.CreateAsync(user, password);
        if (!result.Succeeded)
        {
            throw new InvalidOperationException(string.Join(", ", result.Errors.Select(e => e.Description)));
        }
    }

    private static async Task EnsureCsrfAsync(HttpClient client)
    {
        var response = await client.GetAsync("/api/auth/csrf");
        response.EnsureSuccessStatusCode();
        var payload = await response.Content.ReadFromJsonAsync<CsrfResponse>(JsonOptions);
        if (payload?.Token is null)
        {
            throw new InvalidOperationException("Missing CSRF token");
        }

        client.DefaultRequestHeaders.Remove("X-CSRF-TOKEN");
        client.DefaultRequestHeaders.Add("X-CSRF-TOKEN", payload.Token);
    }

    private sealed record CsrfResponse(string Token);
    private sealed record GroupResponse(Guid Id, string Name, int Version);
    private sealed record InvitationCreatedResponse(Guid Id, string Token, DateTimeOffset ExpiresAt, bool Emailed);
    private sealed record InvitationAcceptedResponse(Guid GroupId, string Role);
    private sealed record InvitationListResponse(List<InvitationListItem> Items);
    private sealed record InvitationListItem(Guid Id, DateTimeOffset CreatedAt, DateTimeOffset ExpiresAt);
}

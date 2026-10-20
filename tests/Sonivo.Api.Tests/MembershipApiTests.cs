using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Sonivo.Domain.Tenancy;

namespace Sonivo.Api.Tests;

public class MembershipApiTests : IClassFixture<SonivoApiFactory>
{
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };
    private readonly SonivoApiFactory _factory;

    public MembershipApiTests(SonivoApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task Anonymous_members_routes_return_401()
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        await EnsureCsrfAsync(client);
        var groupId = Guid.NewGuid();
        var userId = Guid.NewGuid();

        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync($"/api/groups/{groupId}/members")).StatusCode);
        Assert.Equal(
            HttpStatusCode.Unauthorized,
            (await client.DeleteAsync($"/api/groups/{groupId}/members/{userId}")).StatusCode);
        Assert.Equal(
            HttpStatusCode.Unauthorized,
            (await client.PostAsJsonAsync($"/api/groups/{groupId}/members/{userId}/role", new { role = "Member" }))
                .StatusCode);
        Assert.Equal(
            HttpStatusCode.Unauthorized,
            (await client.PostAsJsonAsync($"/api/groups/{groupId}/leave", new { })).StatusCode);
    }

    [Fact]
    public async Task Owner_lists_members_and_member_leaves()
    {
        var owner = await CreateAuthenticatedClientAsync("ppl-owner@example.com");
        var group = await CreateGroupAsync(owner, "People Band");
        var invite = await owner.PostAsJsonAsync($"/api/groups/{group.Id}/invitations", new { });
        invite.EnsureSuccessStatusCode();
        var created = await invite.Content.ReadFromJsonAsync<InvitationCreatedResponse>(JsonOptions);
        Assert.NotNull(created);

        var member = await CreateAuthenticatedClientAsync("ppl-member@example.com");
        var accept = await member.PostAsJsonAsync($"/api/invitations/{created.Token}/accept", new { });
        Assert.Equal(HttpStatusCode.OK, accept.StatusCode);

        var list = await owner.GetAsync($"/api/groups/{group.Id}/members");
        Assert.Equal(HttpStatusCode.OK, list.StatusCode);
        var payload = await list.Content.ReadFromJsonAsync<MemberListResponse>(JsonOptions);
        Assert.NotNull(payload);
        Assert.Equal(2, payload.Items.Count);
        Assert.Contains(payload.Items, i => i.Role == MembershipRoles.Owner);
        Assert.Contains(payload.Items, i => i.Role == MembershipRoles.Member);
        var memberId = payload.Items.Single(i => i.Role == MembershipRoles.Member).UserId;

        var leave = await member.PostAsJsonAsync($"/api/groups/{group.Id}/leave", new { });
        Assert.Equal(HttpStatusCode.NoContent, leave.StatusCode);

        var after = await owner.GetAsync($"/api/groups/{group.Id}/members");
        var afterPayload = await after.Content.ReadFromJsonAsync<MemberListResponse>(JsonOptions);
        Assert.NotNull(afterPayload);
        Assert.Single(afterPayload.Items);

        var auditResponse = await owner.GetAsync($"/api/groups/{group.Id}/audit");
        Assert.Equal(HttpStatusCode.OK, auditResponse.StatusCode);
        using var auditJson = JsonDocument.Parse(await auditResponse.Content.ReadAsStringAsync());
        Assert.Contains(
            auditJson.RootElement.GetProperty("items").EnumerateArray(),
            entry => entry.GetProperty("action").GetString() == GroupAuditEntry.ActionMemberLeft
                && entry.GetProperty("actorUserId").GetGuid() == memberId
                && entry.GetProperty("targetUserId").GetGuid() == memberId);
    }

    [Fact]
    public async Task Owner_sets_and_clears_member_description()
    {
        var owner = await CreateAuthenticatedClientAsync("ppl-desc-owner@example.com");
        var group = await CreateGroupAsync(owner, "Description Band");
        var invite = await owner.PostAsJsonAsync($"/api/groups/{group.Id}/invitations", new { });
        invite.EnsureSuccessStatusCode();
        var created = await invite.Content.ReadFromJsonAsync<InvitationCreatedResponse>(JsonOptions);
        Assert.NotNull(created);

        var member = await CreateAuthenticatedClientAsync("ppl-desc-member@example.com");
        await member.PostAsJsonAsync($"/api/invitations/{created!.Token}/accept", new { });

        var list = await owner.GetAsync($"/api/groups/{group.Id}/members");
        var payload = await list.Content.ReadFromJsonAsync<MemberListResponse>(JsonOptions);
        var memberRow = payload!.Items.First(i => i.Role == MembershipRoles.Member);

        // The description is absent until someone writes it.
        Assert.True(string.IsNullOrEmpty(memberRow.Description));

        var write = await owner.PutAsJsonAsync(
            $"/api/groups/{group.Id}/members/{memberRow.UserId}/description",
            new { description = "Canta los domingos" });
        Assert.Equal(HttpStatusCode.NoContent, write.StatusCode);

        var afterWrite = await owner.GetAsync($"/api/groups/{group.Id}/members");
        var written = await afterWrite.Content.ReadFromJsonAsync<MemberListResponse>(JsonOptions);
        Assert.Equal(
            "Canta los domingos",
            written!.Items.First(i => i.UserId == memberRow.UserId).Description);

        // Clearing is an explicit null, not an empty string.
        var clear = await owner.PutAsJsonAsync(
            $"/api/groups/{group.Id}/members/{memberRow.UserId}/description",
            new { description = (string?)null });
        Assert.Equal(HttpStatusCode.NoContent, clear.StatusCode);

        var afterClear = await owner.GetAsync($"/api/groups/{group.Id}/members");
        var cleared = await afterClear.Content.ReadFromJsonAsync<MemberListResponse>(JsonOptions);
        Assert.True(string.IsNullOrEmpty(cleared!.Items.First(i => i.UserId == memberRow.UserId).Description));
    }

    [Fact]
    public async Task Member_cannot_set_another_member_description()
    {
        var owner = await CreateAuthenticatedClientAsync("ppl-desc-authz-owner@example.com");
        var group = await CreateGroupAsync(owner, "Authz Description Band");
        var invite = await owner.PostAsJsonAsync($"/api/groups/{group.Id}/invitations", new { });
        var created = await invite.Content.ReadFromJsonAsync<InvitationCreatedResponse>(JsonOptions);

        var member = await CreateAuthenticatedClientAsync("ppl-desc-authz-member@example.com");
        await member.PostAsJsonAsync($"/api/invitations/{created!.Token}/accept", new { });

        var list = await owner.GetAsync($"/api/groups/{group.Id}/members");
        var payload = await list.Content.ReadFromJsonAsync<MemberListResponse>(JsonOptions);
        var ownerRow = payload!.Items.First(i => i.Role == MembershipRoles.Owner);

        var attempt = await member.PutAsJsonAsync(
            $"/api/groups/{group.Id}/members/{ownerRow.UserId}/description",
            new { description = "no debo poder" });
        Assert.Equal(HttpStatusCode.Forbidden, attempt.StatusCode);
    }

    [Fact]
    public async Task Last_owner_leave_returns_409()
    {
        var owner = await CreateAuthenticatedClientAsync("ppl-last@example.com");
        var group = await CreateGroupAsync(owner, "Solo Band");
        var leave = await owner.PostAsJsonAsync($"/api/groups/{group.Id}/leave", new { });
        Assert.Equal(HttpStatusCode.Conflict, leave.StatusCode);
    }

    [Fact]
    public async Task Member_remove_returns_403()
    {
        var owner = await CreateAuthenticatedClientAsync("ppl-own2@example.com");
        var group = await CreateGroupAsync(owner, "Authz Band");
        var invite = await owner.PostAsJsonAsync($"/api/groups/{group.Id}/invitations", new { });
        var created = await invite.Content.ReadFromJsonAsync<InvitationCreatedResponse>(JsonOptions);
        var member = await CreateAuthenticatedClientAsync("ppl-mem2@example.com");
        await member.PostAsJsonAsync($"/api/invitations/{created!.Token}/accept", new { });

        var me = await owner.GetAsync("/api/auth/me");
        var mePayload = await me.Content.ReadFromJsonAsync<MeResponse>(JsonOptions);
        var remove = await member.DeleteAsync($"/api/groups/{group.Id}/members/{mePayload!.Id}");
        Assert.Equal(HttpStatusCode.Forbidden, remove.StatusCode);
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
    private sealed record InvitationCreatedResponse(Guid Id, string Token, DateTimeOffset ExpiresAt);
    private sealed record MemberListResponse(List<MemberItem> Items);
    private sealed record MemberItem(
        Guid UserId,
        string DisplayName,
        string Role,
        DateTimeOffset CreatedAt,
        string? Description = null);
    private sealed record MeResponse(Guid Id);
}

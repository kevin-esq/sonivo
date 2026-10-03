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

public class GroupResourcesApiTests : IClassFixture<SonivoApiFactory>
{
    private readonly SonivoApiFactory _factory;

    public GroupResourcesApiTests(SonivoApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task Member_lists_group_resources_with_song_and_arrangement_labels()
    {
        var ownerId = Guid.NewGuid();
        var memberId = Guid.NewGuid();
        var groupId = Guid.NewGuid();
        await SeedUsersAndMembershipAsync(
            ("gres-owner@example.com", "OwnerG1!", ownerId),
            ("gres-member@example.com", "MemberG1!", memberId),
            groupId,
            "Resources Band",
            ownerId,
            memberId);

        var ownerClient = await CreateAuthenticatedClientAsync("gres-owner@example.com", "OwnerG1!");
        var song = await CreateSongAsync(ownerClient, groupId, "Grande es Él");
        var arr = await CreateArrangementAsync(ownerClient, groupId, song.Id, "Acoustic");
        var create = await ownerClient.PostAsJsonAsync(
            $"/api/groups/{groupId}/arrangements/{arr.Id}/resources",
            new { kind = "link", purpose = "chart", label = "Partitura", url = "https://example.com/chart" });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);

        var memberClient = await CreateAuthenticatedClientAsync("gres-member@example.com", "MemberG1!");
        var list = await memberClient.GetFromJsonAsync<List<ResourceResponse>>($"/api/groups/{groupId}/resources");
        var single = Assert.Single(list!);
        Assert.Equal("Grande es Él", single.SongTitle);
        Assert.Equal("Acoustic", single.ArrangementLabel);
        Assert.Equal("Partitura", single.Label);
        Assert.Equal("chart", single.Purpose);
    }

    [Fact]
    public async Task Non_member_gets_404()
    {
        var ownerId = Guid.NewGuid();
        var groupId = Guid.NewGuid();
        await SeedUsersAndMembershipAsync(
            ("gres-owner2@example.com", "OwnerG2!", ownerId),
            ("gres-member2@example.com", "MemberG2!", Guid.NewGuid()),
            groupId,
            "Private Resources",
            ownerId,
            Guid.NewGuid());

        var stranger = await CreateAuthenticatedClientAsync("gres-stranger@example.com");
        var response = await stranger.GetAsync($"/api/groups/{groupId}/resources");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
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
            throw new InvalidOperationException(await register.Content.ReadAsStringAsync());
        }

        await AuthTestHelper.ConfirmEmailAsync(_factory.Services, email);
        await EnsureCsrfAsync(client);
        Assert.Equal(HttpStatusCode.OK,
            (await client.PostAsJsonAsync("/api/auth/login", new { email, password, rememberMe = false })).StatusCode);
        await EnsureCsrfAsync(client);
        return client;
    }

    private static async Task<SongResponse> CreateSongAsync(HttpClient client, Guid groupId, string title)
    {
        var create = await client.PostAsJsonAsync($"/api/groups/{groupId}/songs", new
        {
            title,
            originKind = "original"
        });
        create.EnsureSuccessStatusCode();
        return (await create.Content.ReadFromJsonAsync<SongResponse>())!;
    }

    private static async Task<ArrangementResponse> CreateArrangementAsync(
        HttpClient client,
        Guid groupId,
        Guid songId,
        string label)
    {
        var create = await client.PostAsJsonAsync(
            $"/api/groups/{groupId}/songs/{songId}/arrangements",
            new { label });
        create.EnsureSuccessStatusCode();
        return (await create.Content.ReadFromJsonAsync<ArrangementResponse>())!;
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
        if (await users.FindByEmailAsync(email) is not null)
        {
            return;
        }

        var result = await users.CreateAsync(new ApplicationUser
        {
            Id = id,
            Email = email,
            UserName = email,
            DisplayName = email
        }, password);
        if (!result.Succeeded)
        {
            throw new InvalidOperationException(string.Join(", ", result.Errors.Select(e => e.Description)));
        }
    }

    private static async Task EnsureCsrfAsync(HttpClient client)
    {
        var response = await client.GetAsync("/api/auth/csrf");
        response.EnsureSuccessStatusCode();
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var token = doc.RootElement.GetProperty("token").GetString()!;
        client.DefaultRequestHeaders.Remove("X-CSRF-TOKEN");
        client.DefaultRequestHeaders.Add("X-CSRF-TOKEN", token);
    }

    private sealed record SongResponse(Guid Id, string Title);
    private sealed record ArrangementResponse(Guid Id, Guid SongId, string Label);
    private sealed record ResourceResponse(
        Guid Id,
        Guid ArrangementId,
        Guid SongId,
        string SongTitle,
        string ArrangementLabel,
        string Kind,
        string Purpose,
        string Label,
        string? Url);
}

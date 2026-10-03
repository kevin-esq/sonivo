using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Sonivo.Domain.Tenancy;
using Sonivo.Infrastructure.Identity;
using Microsoft.AspNetCore.Identity;

namespace Sonivo.Api.Tests;

public class TaskApiTests : IClassFixture<SonivoApiFactory>
{
    private readonly SonivoApiFactory _factory;

    public TaskApiTests(SonivoApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task Owner_creates_and_member_lists()
    {
        var ownerId = Guid.NewGuid();
        var memberId = Guid.NewGuid();
        var groupId = Guid.NewGuid();
        await SeedUsersAndMembershipAsync(
            ("task-owner@example.com", "OwnerT1!", ownerId),
            ("task-member@example.com", "MemberT1!", memberId),
            groupId,
            "Tasks Band",
            ownerId,
            memberId);

        var ownerClient = await CreateAuthenticatedClientAsync("task-owner@example.com", "OwnerT1!");
        var create = await ownerClient.PostAsJsonAsync($"/api/groups/{groupId}/tasks", new
        {
            title = "Comprar cuerdas",
            notes = "Para el ensayo",
            dueAt = "2026-10-10T23:59:00Z"
        });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        var task = await create.Content.ReadFromJsonAsync<TaskResponse>();
        Assert.NotNull(task);
        Assert.Equal("open", task.Status);

        var memberClient = await CreateAuthenticatedClientAsync("task-member@example.com", "MemberT1!");
        var list = await memberClient.GetFromJsonAsync<List<TaskResponse>>($"/api/groups/{groupId}/tasks");
        var single = Assert.Single(list!);
        Assert.Equal("Comprar cuerdas", single.Title);

        var status = await memberClient.PostAsJsonAsync(
            $"/api/groups/{groupId}/tasks/{single.Id}/status",
            new { status = "done", expectedVersion = single.Version });
        Assert.Equal(HttpStatusCode.Forbidden, status.StatusCode);
    }

    [Fact]
    public async Task Non_member_gets_404()
    {
        var ownerId = Guid.NewGuid();
        var groupId = Guid.NewGuid();
        await SeedUsersAndMembershipAsync(
            ("task-owner2@example.com", "OwnerT2!", ownerId),
            ("task-member2@example.com", "MemberT2!", Guid.NewGuid()),
            groupId,
            "Private Tasks",
            ownerId,
            Guid.NewGuid());

        var stranger = await CreateAuthenticatedClientAsync("task-stranger@example.com");
        var response = await stranger.GetAsync($"/api/groups/{groupId}/tasks");
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
        var db = scope.ServiceProvider.GetRequiredService<Sonivo.Infrastructure.Persistence.SonivoDbContext>();
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

    private sealed record TaskResponse(
        Guid Id,
        string Title,
        string? Notes,
        string Status,
        DateTimeOffset? DueAt,
        int Version);
}

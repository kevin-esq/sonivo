using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Sonivo.Domain.Tenancy;
using Sonivo.Infrastructure.Identity;
using Sonivo.Infrastructure.Persistence;

namespace Sonivo.Api.Tests;

public class FileResourceApiTests : IClassFixture<SonivoApiFactory>
{
    private readonly SonivoApiFactory _factory;

    public FileResourceApiTests(SonivoApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task Owner_multipart_upload_member_download_and_delete_blob()
    {
        var ownerId = Guid.NewGuid();
        var memberId = Guid.NewGuid();
        var groupId = Guid.NewGuid();
        await SeedUsersAndMembershipAsync(
            ("file-owner@example.com", "OwnerF1!", ownerId),
            ("file-member@example.com", "MemberF1!", memberId),
            groupId,
            "File Band",
            ownerId,
            memberId);

        var ownerClient = await CreateAuthenticatedClientAsync("file-owner@example.com", "OwnerF1!");
        var song = await CreateSongAsync(ownerClient, groupId, "Song");
        var arr = await CreateArrangementAsync(ownerClient, groupId, song.Id, "Arr");
        var basePath = $"/api/groups/{groupId}/arrangements/{arr.Id}/resources";

        var payload = Encoding.UTF8.GetBytes("sonivo chart bytes");
        using var form = new MultipartFormDataContent();
        form.Add(new StringContent("chart"), "purpose");
        form.Add(new StringContent("Partitura"), "label");
        form.Add(new StringContent("Guitar"), "part");
        var fileContent = new ByteArrayContent(payload);
        fileContent.Headers.ContentType = new MediaTypeHeaderValue("text/plain");
        form.Add(fileContent, "file", "chart.txt");

        var create = await ownerClient.PostAsync(basePath, form);
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        var created = await create.Content.ReadFromJsonAsync<ResourceResponse>();
        Assert.NotNull(created);
        Assert.Equal("file", created.Kind);
        Assert.Null(created.Url);
        Assert.Equal("chart.txt", created.OriginalFileName);
        Assert.Equal("text/plain", created.ContentType);
        Assert.Equal(payload.Length, created.ByteSize);

        var memberClient = await CreateAuthenticatedClientAsync("file-member@example.com", "MemberF1!");
        var download = await memberClient.GetAsync($"{basePath}/{created.Id}/content");
        Assert.Equal(HttpStatusCode.OK, download.StatusCode);
        Assert.Equal("text/plain", download.Content.Headers.ContentType?.MediaType);
        Assert.Contains("chart.txt", download.Content.Headers.ContentDisposition?.FileName);
        var downloaded = await download.Content.ReadAsByteArrayAsync();
        Assert.Equal(payload, downloaded);

        var linkContent = await ownerClient.PostAsJsonAsync(basePath, new
        {
            kind = "link",
            purpose = "other",
            label = "Link",
            url = "https://example.com"
        });
        var link = await linkContent.Content.ReadFromJsonAsync<ResourceResponse>();
        Assert.NotNull(link);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await memberClient.GetAsync($"{basePath}/{link.Id}/content")).StatusCode);

        using var memberUpload = new MultipartFormDataContent();
        memberUpload.Add(new StringContent("other"), "purpose");
        memberUpload.Add(new StringContent("Nope"), "label");
        var memberFile = new ByteArrayContent("no"u8.ToArray());
        memberFile.Headers.ContentType = new MediaTypeHeaderValue("text/plain");
        memberUpload.Add(memberFile, "file", "no.txt");
        Assert.Equal(HttpStatusCode.Forbidden,
            (await memberClient.PostAsync(basePath, memberUpload)).StatusCode);

        var stranger = await CreateAuthenticatedClientAsync("file-stranger@example.com");
        Assert.Equal(HttpStatusCode.NotFound,
            (await stranger.GetAsync($"{basePath}/{created.Id}/content")).StatusCode);

        string? objectKey;
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SonivoDbContext>();
            objectKey = await db.Resources.Where(r => r.Id == created.Id).Select(r => r.ObjectKey).SingleAsync();
            Assert.False(string.IsNullOrWhiteSpace(objectKey));
            Assert.True(await db.ResourceBlobs.AnyAsync(b => b.ObjectKey == objectKey));
        }

        var delete = await ownerClient.DeleteAsync($"{basePath}/{created.Id}");
        Assert.Equal(HttpStatusCode.NoContent, delete.StatusCode);

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SonivoDbContext>();
            Assert.False(await db.Resources.AnyAsync(r => r.Id == created.Id));
            Assert.False(await db.ResourceBlobs.AnyAsync(b => b.ObjectKey == objectKey));
        }
    }

    [Fact]
    public async Task Multipart_rejects_bad_mime_and_missing_file()
    {
        var client = await CreateAuthenticatedClientAsync("file-val@example.com");
        var group = await CreateGroupAsync(client, "Val File Band");
        var song = await CreateSongAsync(client, group.Id, "Song");
        var arr = await CreateArrangementAsync(client, group.Id, song.Id, "Arr");
        var basePath = $"/api/groups/{group.Id}/arrangements/{arr.Id}/resources";

        using var noFile = new MultipartFormDataContent();
        noFile.Add(new StringContent("other"), "purpose");
        noFile.Add(new StringContent("Label"), "label");
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsync(basePath, noFile)).StatusCode);

        using var badMime = new MultipartFormDataContent();
        badMime.Add(new StringContent("other"), "purpose");
        badMime.Add(new StringContent("Label"), "label");
        var exe = new ByteArrayContent("MZ"u8.ToArray());
        exe.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");
        badMime.Add(exe, "file", "a.exe");
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsync(basePath, badMime)).StatusCode);
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

        // T-AU-01: mailbox must be proven before the login gate passes.
        await AuthTestHelper.ConfirmEmailAsync(_factory.Services, email);
        await EnsureCsrfAsync(client);
        Assert.Equal(HttpStatusCode.OK,
            (await client.PostAsJsonAsync("/api/auth/login", new { email, password, rememberMe = false })).StatusCode);
        await EnsureCsrfAsync(client);
        return client;
    }

    private static async Task<GroupResponse> CreateGroupAsync(HttpClient client, string name)
    {
        var create = await client.PostAsJsonAsync("/api/groups", new { name });
        create.EnsureSuccessStatusCode();
        return (await create.Content.ReadFromJsonAsync<GroupResponse>())!;
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

    private sealed record GroupResponse(Guid Id, string Name);
    private sealed record SongResponse(Guid Id, string Title);
    private sealed record ArrangementResponse(Guid Id, Guid SongId, string Label);
    private sealed record ResourceResponse(
        Guid Id,
        Guid ArrangementId,
        string Kind,
        string Purpose,
        string Label,
        string? Url,
        string? OriginalFileName,
        string? ContentType,
        long? ByteSize);
}

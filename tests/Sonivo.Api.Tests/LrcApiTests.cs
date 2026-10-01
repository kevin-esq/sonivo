using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Sonivo.Domain.Tenancy;
using Sonivo.Infrastructure.Persistence;

namespace Sonivo.Api.Tests;

/// <summary>
/// Phase 4.2 (.lrc) API tests: permissions (404/403/flag), limits, the
/// errors[{line, reason}] contract, preview-without-save and version conflict.
/// </summary>
public class LrcApiTests : IClassFixture<SonivoApiFactory>
{
    private const string Password = "Password1";

    private readonly SonivoApiFactory _factory;
    private readonly WebApplicationFactory<Program> _lrc;

    public LrcApiTests(SonivoApiFactory factory)
    {
        _factory = factory;
        _lrc = factory.WithWebHostBuilder(b => b.UseSetting("Features:Lrc", "true"));
    }

    [Fact]
    public async Task Anonymous_import_returns_401()
    {
        var client = _lrc.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        var response = await client.PostAsJsonAsync(
            $"/api/groups/{Guid.NewGuid()}/arrangements/{Guid.NewGuid()}/lyrics/import-lrc",
            new { content = "[00:01.00]x" });
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Flag_off_returns_404_even_for_the_owner()
    {
        const string email = "lrc-flag-off@example.com";
        var (ownerWithFlag, _) = await CreateUserAsync(email);
        var (_, arrangement) = await SeedSongAndArrangementAsync(ownerWithFlag, "LRC Flag");

        // A client on the factory WITHOUT the flag (same in-memory database).
        var ownerWithoutFlag = await LoginAsync(_factory, email);
        var response = await ownerWithoutFlag.PostAsJsonAsync(
            $"/api/groups/{arrangement.GroupId}/arrangements/{arrangement.Id}/lyrics/import-lrc",
            new { content = "[00:01.00]x" });

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Owner_previews_without_persisting_the_lyrics()
    {
        var (owner, _) = await CreateUserAsync("lrc-owner@example.com");
        var (_, arrangement) = await SeedSongAndArrangementAsync(owner, "LRC Owner");

        var response = await owner.PostAsJsonAsync(
            $"/api/groups/{arrangement.GroupId}/arrangements/{arrangement.Id}/lyrics/import-lrc",
            new { content = "[00:12.00]Hola\n[00:15.50]Dos" });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var preview = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Hola\nDos", preview.GetProperty("lyrics").GetString());
        Assert.Equal(2, preview.GetProperty("markCount").GetInt32());
        Assert.Contains("\"atMs\":12000", preview.GetProperty("chordTimingJson").GetString());

        // The import must NOT persist anything.
        var detail = await owner.GetFromJsonAsync<JsonElement>(
            $"/api/groups/{arrangement.GroupId}/arrangements/{arrangement.Id}");
        Assert.Equal(JsonValueKind.Null, detail.GetProperty("lyrics").ValueKind);
        Assert.Equal(JsonValueKind.Null, detail.GetProperty("chordTimingJson").ValueKind);
    }

    [Fact]
    public async Task Member_is_forbidden_to_import_but_can_export()
    {
        var (owner, _) = await CreateUserAsync("lrc-owner2@example.com");
        var (member, memberId) = await CreateUserAsync("lrc-member@example.com");
        var (_, arrangement) = await SeedSongAndArrangementAsync(owner, "LRC Member");
        await AddMemberAsync(arrangement.GroupId, memberId);

        var import = await member.PostAsJsonAsync(
            $"/api/groups/{arrangement.GroupId}/arrangements/{arrangement.Id}/lyrics/import-lrc",
            new { content = "[00:01.00]x" });
        Assert.Equal(HttpStatusCode.Forbidden, import.StatusCode);

        // The owner saves marks through the existing versioned PATCH.
        await SaveLyricsAsync(owner, arrangement, "[00:12.00]Uno\n[00:15.50]Dos");

        var export = await member.GetAsync(
            $"/api/groups/{arrangement.GroupId}/arrangements/{arrangement.Id}/lyrics/export.lrc");
        Assert.Equal(HttpStatusCode.OK, export.StatusCode);
        var body = await export.Content.ReadAsStringAsync();
        Assert.Contains("[00:12.00]Uno", body);
        Assert.Contains("[00:15.50]Dos", body);
    }

    [Fact]
    public async Task Non_member_gets_404_on_both_endpoints()
    {
        var (owner, _) = await CreateUserAsync("lrc-owner3@example.com");
        var (stranger, _) = await CreateUserAsync("lrc-stranger@example.com");
        var (_, arrangement) = await SeedSongAndArrangementAsync(owner, "LRC Stranger");
        await SaveLyricsAsync(owner, arrangement, "[00:01.00]Uno");

        var import = await stranger.PostAsJsonAsync(
            $"/api/groups/{arrangement.GroupId}/arrangements/{arrangement.Id}/lyrics/import-lrc",
            new { content = "[00:01.00]x" });
        var export = await stranger.GetAsync(
            $"/api/groups/{arrangement.GroupId}/arrangements/{arrangement.Id}/lyrics/export.lrc");

        Assert.Equal(HttpStatusCode.NotFound, import.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, export.StatusCode);
    }

    [Fact]
    public async Task Size_limit_returns_400()
    {
        var (owner, _) = await CreateUserAsync("lrc-size@example.com");
        var (_, arrangement) = await SeedSongAndArrangementAsync(owner, "LRC Size");
        var oversized = Convert.ToBase64String(new byte[(256 * 1024) + 1]);

        var response = await owner.PostAsJsonAsync(
            $"/api/groups/{arrangement.GroupId}/arrangements/{arrangement.Id}/lyrics/import-lrc",
            new { contentBase64 = oversized });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Corrupt_lines_return_200_with_line_and_reason()
    {
        var (owner, _) = await CreateUserAsync("lrc-corrupt@example.com");
        var (_, arrangement) = await SeedSongAndArrangementAsync(owner, "LRC Corrupt");

        var response = await owner.PostAsJsonAsync(
            $"/api/groups/{arrangement.GroupId}/arrangements/{arrangement.Id}/lyrics/import-lrc",
            new { content = "[00:12.00Sin corchete\n[aa:bb]No numerico" });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var preview = await response.Content.ReadFromJsonAsync<JsonElement>();
        var errors = preview.GetProperty("errors").EnumerateArray().ToList();
        Assert.Equal(2, errors.Count);
        Assert.Equal(1, errors[0].GetProperty("line").GetInt32());
        Assert.Equal("no time mark", errors[0].GetProperty("reason").GetString());
        Assert.Equal(2, errors[1].GetProperty("line").GetInt32());
    }

    [Fact]
    public async Task Windows_1252_fallback_is_reported_as_a_warning()
    {
        var (owner, _) = await CreateUserAsync("lrc-1252@example.com");
        var (_, arrangement) = await SeedSongAndArrangementAsync(owner, "LRC 1252");
        // "[00:01.00]Café" with é as the single Windows-1252 byte 0xE9 (invalid UTF-8).
        var bytes = System.Text.Encoding.UTF8.GetBytes("[00:01.00]Caf").Concat(new byte[] { 0xE9 }).ToArray();

        var response = await owner.PostAsJsonAsync(
            $"/api/groups/{arrangement.GroupId}/arrangements/{arrangement.Id}/lyrics/import-lrc",
            new { contentBase64 = Convert.ToBase64String(bytes) });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var preview = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("windows-1252", preview.GetProperty("encoding").GetString());
        Assert.NotEmpty(preview.GetProperty("warnings").EnumerateArray());
        Assert.Equal("Café", preview.GetProperty("lyrics").GetString());
    }

    [Fact]
    public async Task Version_conflict_on_save_returns_409()
    {
        var (owner, _) = await CreateUserAsync("lrc-conflict@example.com");
        var (_, arrangement) = await SeedSongAndArrangementAsync(owner, "LRC Conflict");

        var stale = await owner.PatchAsJsonAsync(
            $"/api/groups/{arrangement.GroupId}/arrangements/{arrangement.Id}",
            new { label = "Acoustic", lyrics = "Uno", expectedVersion = 999 });

        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);
    }

    // ---------- helpers ----------

    private async Task SaveLyricsAsync(HttpClient owner, ArrangementIds ids, string lyrics)
    {
        var preview = await owner.PostAsJsonAsync(
            $"/api/groups/{ids.GroupId}/arrangements/{ids.Id}/lyrics/import-lrc",
            new { content = lyrics.Replace("\n", "\n") });
        preview.EnsureSuccessStatusCode();
        var body = await preview.Content.ReadFromJsonAsync<JsonElement>();

        var patch = await owner.PatchAsJsonAsync(
            $"/api/groups/{ids.GroupId}/arrangements/{ids.Id}",
            new
            {
                label = "Acoustic",
                lyrics = body.GetProperty("lyrics").GetString(),
                chordTimingJson = body.GetProperty("chordTimingJson").GetString(),
                expectedVersion = 1
            });
        patch.EnsureSuccessStatusCode();
    }

    private async Task<(HttpClient Client, Guid UserId)> CreateUserAsync(string email)
    {
        var client = _lrc.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false,
            HandleCookies = true
        });
        await EnsureCsrfAsync(client);
        var register = await client.PostAsJsonAsync("/api/auth/register", new
        {
            email,
            password = Password,
            displayName = email
        });
        if (register.StatusCode is not (HttpStatusCode.Created or HttpStatusCode.Conflict))
        {
            throw new InvalidOperationException(await register.Content.ReadAsStringAsync());
        }

        var created = await register.Content.ReadFromJsonAsync<UserResponse>()
            ?? throw new InvalidOperationException("register returned no body");

        await AuthTestHelper.ConfirmEmailAsync(_lrc.Services, email);
        await EnsureCsrfAsync(client);
        Assert.Equal(HttpStatusCode.OK,
            (await client.PostAsJsonAsync("/api/auth/login", new { email, password = Password, rememberMe = false })).StatusCode);
        await EnsureCsrfAsync(client);
        return (client, created.Id);
    }

    private static async Task<HttpClient> LoginAsync(WebApplicationFactory<Program> factory, string email)
    {
        var client = factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false,
            HandleCookies = true
        });
        await EnsureCsrfAsync(client);
        Assert.Equal(HttpStatusCode.OK,
            (await client.PostAsJsonAsync("/api/auth/login", new { email, password = Password, rememberMe = false })).StatusCode);
        await EnsureCsrfAsync(client);
        return client;
    }

    private async Task AddMemberAsync(Guid groupId, Guid userId)
    {
        using var scope = _lrc.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SonivoDbContext>();
        db.Memberships.Add(Membership.CreateMember(groupId, userId, DateTimeOffset.UtcNow));
        await db.SaveChangesAsync();
    }

    private async Task<(Guid GroupId, ArrangementIds Arrangement)> SeedSongAndArrangementAsync(
        HttpClient client,
        string groupName)
    {
        var group = await CreateAsync<GroupResponse>(client, "/api/groups", new { name = groupName });
        var song = await CreateAsync<SongResponse>(client, $"/api/groups/{group.Id}/songs",
            new { title = "Song", originKind = "original" });
        var arrangement = await CreateAsync<ArrangementResponse>(
            client,
            $"/api/groups/{group.Id}/songs/{song.Id}/arrangements",
            new { label = "Acoustic" });
        return (group.Id, new ArrangementIds(group.Id, arrangement.Id));
    }

    private static async Task<T> CreateAsync<T>(HttpClient client, string path, object payload)
    {
        var response = await client.PostAsJsonAsync(path, payload);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<T>())!;
    }

    private static async Task EnsureCsrfAsync(HttpClient client)
    {
        var response = await client.GetAsync("/api/auth/csrf");
        response.EnsureSuccessStatusCode();
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var token = doc.RootElement.GetProperty("token").GetString()
            ?? throw new InvalidOperationException("Missing CSRF token");
        client.DefaultRequestHeaders.Remove("X-CSRF-TOKEN");
        client.DefaultRequestHeaders.Add("X-CSRF-TOKEN", token);
    }

    private sealed record ArrangementIds(Guid GroupId, Guid Id);
    private sealed record UserResponse(Guid Id, string? Email, string? DisplayName);
    private sealed record GroupResponse(Guid Id, string Name, int Version, string? Role);
    private sealed record SongResponse(Guid Id, string Title, int Version);
    private sealed record ArrangementResponse(Guid Id, Guid SongId, string Label, int Version);
}

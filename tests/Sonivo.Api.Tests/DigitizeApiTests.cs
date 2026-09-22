using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Sonivo.Application.Abstractions;
using Sonivo.Domain.Tenancy;
using Sonivo.Infrastructure.Identity;
using Sonivo.Infrastructure.Persistence;

namespace Sonivo.Api.Tests;

/// <summary>
/// T-W32-01: digitize endpoints against a fake transcriber — no model
/// download in tests. 202 → done, 404/403, link rejection, over-cap failure.
/// </summary>
public class DigitizeApiTests : IClassFixture<SonivoApiFactory>
{
    private readonly SonivoApiFactory _factory;

    public DigitizeApiTests(SonivoApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task Owner_starts_job_and_polls_to_done()
    {
        var fake = new FakeTranscriber(_ =>
            [new TranscribedSegment(0, 3000, "[MÚSICA]"), new TranscribedSegment(3500, 5000, "Santo")]);
        var client = await CreateClientWithTranscriberAsync("dig-owner@example.com", fake);
        var group = await CreateGroupAsync(client, "Dig Band");
        var song = await CreateSongAsync(client, group.Id, "Dig Song");
        var arr = await CreateArrangementAsync(client, group.Id, song.Id, "Dig Arr");
        var resource = await UploadWavAsync(client, group.Id, arr.Id, "Guía");

        var start = await client.PostAsJsonAsync(
            $"/api/groups/{group.Id}/arrangements/{arr.Id}/digitize",
            new { resourceId = resource.Id });
        Assert.Equal(HttpStatusCode.Accepted, start.StatusCode);
        var started = await start.Content.ReadFromJsonAsync<JobStartedResponse>();
        Assert.NotNull(started);
        Assert.Equal("queued", started.Status);

        var job = await PollUntilTerminalAsync(
            client, $"/api/groups/{group.Id}/arrangements/{arr.Id}/digitize/{started.JobId}");
        Assert.Equal("done", job.Status);
        Assert.Null(job.Error);
        Assert.NotNull(job.Segments);
        Assert.Equal(2, job.Segments.Count);
        Assert.Equal(0, job.Segments[0].StartMs);
        Assert.Equal(3000, job.Segments[0].EndMs);
        Assert.Equal("[MÚSICA]", job.Segments[0].Text);
    }

    [Fact]
    public async Task Stranger_gets_not_found_and_member_gets_forbidden()
    {
        var fake = new FakeTranscriber(_ => [new TranscribedSegment(0, 100, "x")]);
        var ownerId = Guid.NewGuid();
        var memberId = Guid.NewGuid();
        var groupId = Guid.NewGuid();
        await SeedUsersAndMembershipAsync(
            ("dig2-owner@example.com", "OwnerD2!", ownerId),
            ("dig2-member@example.com", "MemberD2!", memberId),
            groupId,
            "Dig Band 2",
            ownerId,
            memberId);

        var ownerClient = await CreateAuthenticatedClientAsync(
            WithTranscriber(fake), "dig2-owner@example.com", "OwnerD2!");
        var song = await CreateSongAsync(ownerClient, groupId, "Song");
        var arr = await CreateArrangementAsync(ownerClient, groupId, song.Id, "Arr");
        var resource = await UploadWavAsync(ownerClient, groupId, arr.Id, "Guía");
        var basePath = $"/api/groups/{groupId}/arrangements/{arr.Id}/digitize";

        var stranger = await CreateAuthenticatedClientAsync(
            WithTranscriber(fake), "dig2-stranger@example.com");
        Assert.Equal(HttpStatusCode.NotFound,
            (await stranger.PostAsJsonAsync(basePath, new { resourceId = resource.Id })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await stranger.GetAsync($"{basePath}/{Guid.NewGuid()}")).StatusCode);

        var memberClient = await CreateAuthenticatedClientAsync(
            WithTranscriber(fake), "dig2-member@example.com", "MemberD2!");
        Assert.Equal(HttpStatusCode.Forbidden,
            (await memberClient.PostAsJsonAsync(basePath, new { resourceId = resource.Id })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await memberClient.GetAsync($"{basePath}/{Guid.NewGuid()}")).StatusCode);
    }

    [Fact]
    public async Task Link_resource_is_rejected_with_clear_error()
    {
        var fake = new FakeTranscriber(_ => [new TranscribedSegment(0, 100, "x")]);
        var client = await CreateClientWithTranscriberAsync("dig-link@example.com", fake);
        var group = await CreateGroupAsync(client, "Dig Link Band");
        var song = await CreateSongAsync(client, group.Id, "Song");
        var arr = await CreateArrangementAsync(client, group.Id, song.Id, "Arr");

        var link = await client.PostAsJsonAsync(
            $"/api/groups/{group.Id}/arrangements/{arr.Id}/resources",
            new { kind = "link", purpose = "audio", label = "Ref", url = "https://example.com/a.mp3" });
        link.EnsureSuccessStatusCode();
        var created = await link.Content.ReadFromJsonAsync<ResourceResponse>();
        Assert.NotNull(created);

        var start = await client.PostAsJsonAsync(
            $"/api/groups/{group.Id}/arrangements/{arr.Id}/digitize",
            new { resourceId = created.Id });
        Assert.Equal(HttpStatusCode.BadRequest, start.StatusCode);
        var body = await start.Content.ReadAsStringAsync();
        Assert.Contains("enlace", body, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Over_cap_transcript_fails_job_cleanly()
    {
        var tooMany = Enumerable.Range(0, 501)
            .Select(i => new TranscribedSegment(i * 100, i * 100 + 50, $"w{i}"))
            .ToList();
        var fake = new FakeTranscriber(_ => tooMany);
        var client = await CreateClientWithTranscriberAsync("dig-cap@example.com", fake);
        var group = await CreateGroupAsync(client, "Dig Cap Band");
        var song = await CreateSongAsync(client, group.Id, "Song");
        var arr = await CreateArrangementAsync(client, group.Id, song.Id, "Arr");
        var resource = await UploadWavAsync(client, group.Id, arr.Id, "Guía");

        var start = await client.PostAsJsonAsync(
            $"/api/groups/{group.Id}/arrangements/{arr.Id}/digitize",
            new { resourceId = resource.Id });
        Assert.Equal(HttpStatusCode.Accepted, start.StatusCode);
        var started = await start.Content.ReadFromJsonAsync<JobStartedResponse>();
        Assert.NotNull(started);

        var job = await PollUntilTerminalAsync(
            client, $"/api/groups/{group.Id}/arrangements/{arr.Id}/digitize/{started.JobId}");
        Assert.Equal("failed", job.Status);
        Assert.Null(job.Segments);
        Assert.Contains("500", job.Error);
    }

    [Fact]
    public async Task Unknown_job_is_not_found()
    {
        var fake = new FakeTranscriber(_ => [new TranscribedSegment(0, 100, "x")]);
        var client = await CreateClientWithTranscriberAsync("dig-404@example.com", fake);
        var group = await CreateGroupAsync(client, "Dig 404 Band");
        var song = await CreateSongAsync(client, group.Id, "Song");
        var arr = await CreateArrangementAsync(client, group.Id, song.Id, "Arr");

        Assert.Equal(HttpStatusCode.NotFound,
            (await client.GetAsync($"/api/groups/{group.Id}/arrangements/{arr.Id}/digitize/{Guid.NewGuid()}")).StatusCode);
    }

    private Action<IWebHostBuilder> WithTranscriber(IAudioTranscriber fake)
        => builder => builder.ConfigureTestServices(services =>
        {
            services.RemoveAll<IAudioTranscriber>();
            services.AddSingleton(fake);
        });

    private async Task<HttpClient> CreateClientWithTranscriberAsync(string email, IAudioTranscriber fake)
        => await CreateAuthenticatedClientAsync(WithTranscriber(fake), email);

    private async Task<HttpClient> CreateAuthenticatedClientAsync(
        Action<IWebHostBuilder> configure,
        string email,
        string password = "Password1")
    {
        var derived = _factory.WithWebHostBuilder(configure);
        var client = derived.CreateClient(
            new WebApplicationFactoryClientOptions
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

        // T-AU-01: mailbox must be proven before the login gate passes
        // (derived factory owns this client's store).
        await AuthTestHelper.ConfirmEmailAsync(derived.Services, email);
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

    private static async Task<ResourceResponse> UploadWavAsync(
        HttpClient client, Guid groupId, Guid arrangementId, string label)
    {
        using var form = new MultipartFormDataContent();
        form.Add(new StringContent("audio"), "purpose");
        form.Add(new StringContent(label), "label");
        var fileContent = new ByteArrayContent(new byte[] { 0x52, 0x49, 0x46, 0x46, 0x01, 0x02 });
        fileContent.Headers.ContentType = new MediaTypeHeaderValue("audio/wav");
        form.Add(fileContent, "file", "guia.wav");

        var create = await client.PostAsync(
            $"/api/groups/{groupId}/arrangements/{arrangementId}/resources", form);
        create.EnsureSuccessStatusCode();
        return (await create.Content.ReadFromJsonAsync<ResourceResponse>())!;
    }

    private static async Task<DigitizeJobResponse> PollUntilTerminalAsync(HttpClient client, string url)
    {
        var deadline = DateTimeOffset.UtcNow.AddSeconds(20);
        while (true)
        {
            var response = await client.GetAsync(url);
            response.EnsureSuccessStatusCode();
            var job = (await response.Content.ReadFromJsonAsync<DigitizeJobResponse>())!;
            if (job.Status is "done" or "failed")
            {
                return job;
            }

            if (DateTimeOffset.UtcNow > deadline)
            {
                throw new TimeoutException($"Digitize job at {url} did not finish in time.");
            }

            await Task.Delay(200);
        }
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
        var users = scope.ServiceProvider.GetRequiredService<Microsoft.AspNetCore.Identity.UserManager<ApplicationUser>>();
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
        Microsoft.AspNetCore.Identity.UserManager<ApplicationUser> users,
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

    private sealed class FakeTranscriber(Func<Stream, IReadOnlyList<TranscribedSegment>> respond) : IAudioTranscriber
    {
        private readonly Func<Stream, IReadOnlyList<TranscribedSegment>> _respond = respond;

        public Task<IReadOnlyList<TranscribedSegment>> TranscribeAsync(
            Stream audio, string contentType, CancellationToken cancellationToken)
            => Task.FromResult(_respond(audio));
    }

    private sealed record GroupResponse(Guid Id, string Name);
    private sealed record SongResponse(Guid Id, string Title);
    private sealed record ArrangementResponse(Guid Id, Guid SongId, string Label);
    private sealed record ResourceResponse(Guid Id);
    private sealed record JobStartedResponse(Guid JobId, string Status);
    private sealed record SegmentResponse(int StartMs, int EndMs, string Text);
    private sealed record DigitizeJobResponse(Guid JobId, string Status, List<SegmentResponse>? Segments, string? Error);
}

using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Sonivo.Domain.Tenancy;
using Sonivo.Infrastructure.Identity;
using Sonivo.Infrastructure.Persistence;

namespace Sonivo.Api.Tests;

/// <summary>
/// Phase 4.1 (F3b): handle login, CSV bulk add, GDPR exports and the Owner-transfer notice.
/// </summary>
public class RosterF3bApiTests : IClassFixture<SonivoApiFactory>, IClassFixture<GroupBrandingOffFactory>
{
    private readonly SonivoApiFactory _factory;
    private readonly GroupBrandingOffFactory _factoryOff;

    public RosterF3bApiTests(SonivoApiFactory factory, GroupBrandingOffFactory factoryOff)
    {
        _factory = factory;
        _factoryOff = factoryOff;
    }

    [Fact]
    public async Task No_email_member_gets_a_handle_and_can_sign_in_with_it()
    {
        var owner = await CreateAuthenticatedClientAsync(_factory, "f3b-handle-owner@example.com");
        var group = await CreateGroupAsync(owner, "Handle Band");
        Assert.False(string.IsNullOrWhiteSpace(group.Slug));

        var provision = await owner.PostAsJsonAsync($"/api/groups/{group.Id}/roster",
            new { displayName = "Sin Correo", grantAccess = true });
        Assert.Equal(HttpStatusCode.Created, provision.StatusCode);
        var provisioned = await provision.Content.ReadFromJsonAsync<ProvisionResponse>();
        Assert.NotNull(provisioned);
        Assert.Equal("temporary_password", provisioned!.Credential);
        Assert.False(string.IsNullOrWhiteSpace(provisioned.Handle));
        Assert.False(string.IsNullOrWhiteSpace(provisioned.TemporaryPassword));

        var roster = await owner.GetFromJsonAsync<RosterResponse>($"/api/groups/{group.Id}/roster");
        var person = roster!.Items.Single(i => i.DisplayName == "Sin Correo");
        Assert.Equal(provisioned.Handle, person.Handle);

        // Sign in as handle@slug on a clean session.
        var anon = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        await EnsureCsrfAsync(anon);
        var login = await anon.PostAsJsonAsync(
            $"/api/auth/login/handle/{group.Slug}",
            new { handle = provisioned.Handle, password = provisioned.TemporaryPassword });
        Assert.True(login.StatusCode == HttpStatusCode.OK, await login.Content.ReadAsStringAsync());

        var me = await anon.GetFromJsonAsync<MeResponse>("/api/auth/me");
        Assert.NotNull(me);
        Assert.True(me!.MustChangePassword);

        // The blocking gate holds until the temporary credential is replaced.
        var blocked = await anon.GetAsync("/api/groups");
        Assert.Equal(HttpStatusCode.Forbidden, blocked.StatusCode);

        await EnsureCsrfAsync(anon);
        var changed = await anon.PostAsJsonAsync("/api/auth/change-password",
            new { currentPassword = provisioned.TemporaryPassword, newPassword = "NuevaClave1" });
        Assert.Equal(HttpStatusCode.OK, changed.StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await anon.GetAsync("/api/groups")).StatusCode);
    }

    [Fact]
    public async Task Handle_login_is_uniform_401_and_404_when_the_flag_is_off()
    {
        var owner = await CreateAuthenticatedClientAsync(_factory, "f3b-uniform-owner@example.com");
        var group = await CreateGroupAsync(owner, "Uniform Band");
        var provision = await owner.PostAsJsonAsync($"/api/groups/{group.Id}/roster",
            new { displayName = "Uniforme", grantAccess = true });
        var provisioned = await provision.Content.ReadFromJsonAsync<ProvisionResponse>();

        var anon = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });

        async Task AssertUniform401Async(string slug, string handle, string password)
        {
            await EnsureCsrfAsync(anon);
            var response = await anon.PostAsJsonAsync(
                $"/api/auth/login/handle/{slug}", new { handle, password });
            Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
            var body = await response.Content.ReadAsStringAsync();
            Assert.Contains("Invalid credentials", body);
            Assert.DoesNotContain(handle, body);
        }

        await AssertUniform401Async(group.Slug!, "nadie-existe", "Password1");
        await AssertUniform401Async("slug-inventado", provisioned!.Handle!, "Password1");
        await AssertUniform401Async(group.Slug!, provisioned!.Handle!, "Password-incorrecta");

        // Flag off → the endpoint does not exist (404), like the rest of the phase.
        var offOwner = await CreateAuthenticatedClientAsync(_factoryOff, "f3b-off-owner@example.com");
        var offGroup = await CreateGroupAsync(offOwner, "Off Band");
        var offAnon = _factoryOff.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        await EnsureCsrfAsync(offAnon);
        var offLogin = await offAnon.PostAsJsonAsync(
            $"/api/auth/login/handle/{offGroup.Slug}", new { handle = "x", password = "y" });
        Assert.Equal(HttpStatusCode.NotFound, offLogin.StatusCode);
    }

    [Fact]
    public async Task Csv_bulk_add_reports_per_row_errors_and_creates_valid_rows()
    {
        var owner = await CreateAuthenticatedClientAsync(_factory, "f3b-csv-owner@example.com");
        var group = await CreateGroupAsync(owner, "CSV Band");

        var csv = string.Join("\n",
            "displayName,email,handle",
            "Ana,,",
            "Beto,,",
            ",,",
            "Carla,repetida@example.com,",
            "Dani,repetida@example.com,");

        var response = await owner.PostAsJsonAsync($"/api/groups/{group.Id}/roster/import", new { csv });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var report = await response.Content.ReadFromJsonAsync<ImportReport>();
        Assert.NotNull(report);
        Assert.Equal(3, report!.Created);
        Assert.Equal(2, report.Failed);
        Assert.Contains(report.Rows, r => r.Row == 3 && r.Status == "error");
        Assert.Contains(report.Rows, r => r.Row == 5 && r.Status == "error");

        var roster = await owner.GetFromJsonAsync<RosterResponse>($"/api/groups/{group.Id}/roster");
        Assert.Contains(roster!.Items, i => i.DisplayName == "Ana" && i.Handle is not null);
        Assert.Contains(roster.Items, i => i.DisplayName == "Beto");
    }

    [Fact]
    public async Task Csv_bulk_add_rejects_a_header_without_display_name_and_too_many_rows()
    {
        var owner = await CreateAuthenticatedClientAsync(_factory, "f3b-csv-limit@example.com");
        var group = await CreateGroupAsync(owner, "CSV Limit");

        var badHeader = await owner.PostAsJsonAsync($"/api/groups/{group.Id}/roster/import",
            new { csv = "name,email\nAna,a@example.com" });
        Assert.Equal(HttpStatusCode.BadRequest, badHeader.StatusCode);

        var rows = "displayName\n" + string.Join("\n", Enumerable.Range(0, 201).Select(i => $"P{i}"));
        var tooMany = await owner.PostAsJsonAsync($"/api/groups/{group.Id}/roster/import", new { csv = rows });
        Assert.Equal(HttpStatusCode.BadRequest, tooMany.StatusCode);
    }

    [Fact]
    public async Task Group_export_is_owner_only_and_includes_roster_and_repertoire()
    {
        var owner = await CreateAuthenticatedClientAsync(_factory, "f3b-export-owner@example.com");
        var group = await CreateGroupAsync(owner, "Export Band");
        var roster = await owner.PostAsJsonAsync($"/api/groups/{group.Id}/roster", new { displayName = "Ana", grantAccess = true });
        Assert.Equal(HttpStatusCode.Created, roster.StatusCode);
        var song = await owner.PostAsJsonAsync($"/api/groups/{group.Id}/songs",
            new { title = "Canción", originKind = "original" });
        Assert.True(song.IsSuccessStatusCode, await song.Content.ReadAsStringAsync());

        var response = await owner.GetAsync($"/api/groups/{group.Id}/export");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("application/json", response.Content.Headers.ContentType?.MediaType);
        var body = await response.Content.ReadAsStringAsync();
        Assert.True(body.Contains("Ana"), body);
        // Non-ASCII titles serialize escaped (\u00F3); assert the stable prefix.
        Assert.True(body.Contains("Canci"), body);
        HttpResponseAssertions.FormFieldContentDisposition(response, "sonivo-grupo-");

        // A non-member cannot see the group at all.
        var outsider = await CreateAuthenticatedClientAsync(_factory, "f3b-export-outsider@example.com");
        var forbidden = await outsider.GetAsync($"/api/groups/{group.Id}/export");
        Assert.Equal(HttpStatusCode.NotFound, forbidden.StatusCode);
    }

    [Fact]
    public async Task Own_data_export_returns_the_requesting_user_profile_and_memberships()
    {
        var email = "f3b-own-export@example.com";
        var client = await CreateAuthenticatedClientAsync(_factory, email);
        var group = await CreateGroupAsync(client, "Own Band");

        var response = await client.GetAsync("/api/auth/export");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains(email, body);
        Assert.Contains(group.Id.ToString("D"), body);
        HttpResponseAssertions.FormFieldContentDisposition(response, "sonivo-mis-datos");
    }

    [Fact]
    public async Task Promoting_a_member_to_owner_is_audited()
    {
        var email = "f3b-transfer@example.com";
        var owner = await CreateAuthenticatedClientAsync(_factory, "f3b-transfer-owner@example.com");
        var group = await CreateGroupAsync(owner, "Transfer Band");

        var provision = await owner.PostAsJsonAsync($"/api/groups/{group.Id}/roster",
            new { displayName = "Futuro Organizador", email, grantAccess = true });
        var provisioned = await provision.Content.ReadFromJsonAsync<ProvisionResponse>();
        Assert.NotNull(provisioned?.UserId);

        var promote = await owner.PostAsJsonAsync(
            $"/api/groups/{group.Id}/members/{provisioned!.UserId}/role",
            new { role = "Owner" });
        Assert.Equal(HttpStatusCode.NoContent, promote.StatusCode);

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SonivoDbContext>();
        Assert.True(await db.AccountAudits.AnyAsync(
            a => a.Action == AccountAudit.ActionOwnerTransferred && a.GroupId == group.Id));
    }

    [Fact]
    public async Task Provisional_handle_conflicts_are_rejected()
    {
        var owner = await CreateAuthenticatedClientAsync(_factory, "f3b-handle-conflict@example.com");
        var group = await CreateGroupAsync(owner, "Conflict Band");

        var first = await owner.PostAsJsonAsync($"/api/groups/{group.Id}/roster",
            new { displayName = "Uno", grantAccess = true, handle = "apodo" });
        Assert.Equal(HttpStatusCode.Created, first.StatusCode);

        var second = await owner.PostAsJsonAsync($"/api/groups/{group.Id}/roster",
            new { displayName = "Dos", grantAccess = true, handle = "apodo" });
        Assert.Equal(HttpStatusCode.Conflict, second.StatusCode);

        var invalid = await owner.PostAsJsonAsync($"/api/groups/{group.Id}/roster",
            new { displayName = "Tres", grantAccess = true, handle = "A B!" });
        Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);
    }

    private static async Task<GroupResponse> CreateGroupAsync(HttpClient client, string name)
    {
        var response = await client.PostAsJsonAsync("/api/groups", new { name });
        response.EnsureSuccessStatusCode();
        var group = await response.Content.ReadFromJsonAsync<GroupResponse>();
        Assert.NotNull(group);
        return group!;
    }

    private static async Task<HttpClient> CreateAuthenticatedClientAsync(
        WebApplicationFactory<Program> factory,
        string email,
        string password = "Password1")
    {
        var client = factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false,
            HandleCookies = true
        });
        await EnsureCsrfAsync(client);
        await client.PostAsJsonAsync("/api/auth/register", new { email, password, displayName = email });
        await AuthTestHelper.ConfirmEmailAsync(factory.Services, email);
        await EnsureCsrfAsync(client);
        var login = await client.PostAsJsonAsync("/api/auth/login", new { email, password, rememberMe = false });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        await EnsureCsrfAsync(client);
        return client;
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

    private sealed record GroupResponse(Guid Id, string Name, string? Slug);
    private sealed record RosterItem(Guid MemberId, Guid? UserId, string DisplayName, string Role, bool HasAccess, string? Handle);
    private sealed record RosterResponse(List<RosterItem> Items);
    private sealed record ProvisionResponse(Guid MemberId, Guid? UserId, string Credential, string? TemporaryPassword, bool Mailed, string? Handle);
    private sealed record ImportRow(int Row, string Status, string? Error);
    private sealed record ImportReport(int Created, int Failed, List<ImportRow> Rows);
    private sealed record MeResponse(Guid Id, string? Email, string? DisplayName, bool EmailConfirmed, bool MustChangePassword);
}

internal static class HttpResponseAssertions
{
    public static void FormFieldContentDisposition(System.Net.Http.HttpResponseMessage response, string prefix)
    {
        var disposition = response.Content.Headers.ContentDisposition;
        Assert.NotNull(disposition);
        Assert.StartsWith(prefix, disposition!.FileName ?? string.Empty);
    }
}

using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Sonivo.Infrastructure.Persistence;

namespace Sonivo.Api.Tests;

public sealed class StripeBillingApiTests
{
    [Fact]
    public async Task Stripe_webhook_accepts_the_official_signature_header()
    {
        const string secret = "whsec_unit_only";
        const string payload = """
            {"id":"evt_header_test","object":"event","api_version":"2025-09-30.clover","created":1794182400,"livemode":false,"type":"customer.subscription.updated","data":{"object":{"id":"sub_test","object":"subscription","customer":"cus_test"}}}
            """;
        using var baseline = new SonivoApiFactory();
        using var factory = baseline.WithWebHostBuilder(builder =>
        {
            builder.UseSetting("Payments:Provider", "stripe");
            builder.UseSetting("Payments:Stripe:Environment", "sandbox");
            builder.UseSetting("Payments:Stripe:ApiKey", "rk_test_unit_only");
            builder.UseSetting("Payments:Stripe:WebhookSecret", secret);
        });
        using var client = factory.CreateClient();
        var timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var digest = HMACSHA256.HashData(Encoding.UTF8.GetBytes(secret), Encoding.UTF8.GetBytes($"{timestamp}.{payload}"));
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/payments/webhook")
        {
            Content = new StringContent(payload, Encoding.UTF8, "application/json")
        };
        request.Headers.Add("Stripe-Signature", $"t={timestamp},v1={Convert.ToHexStringLower(digest)}");

        using var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Stripe_mode_blocks_manual_assignment_and_unconfigured_checkout()
    {
        using var baseline = new SonivoApiFactory();
        using var factory = baseline.WithWebHostBuilder(builder =>
        {
            builder.UseSetting("Payments:Provider", "stripe");
            builder.UseSetting("Payments:EnableAdminGrants", "true");
            builder.UseSetting("Payments:Stripe:ApiKey", "");
            builder.UseSetting("Payments:Stripe:WebhookSecret", "");
        });
        using var client = factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false, HandleCookies = true });
        await Csrf(client);
        var email = $"stripe-owner-{Guid.NewGuid():N}@example.com";
        using var ownerRegistration = await client.PostAsJsonAsync("/api/auth/register", new
            { email, password = "Password1", displayName = "Billing Owner" });
        Assert.True(ownerRegistration.StatusCode == HttpStatusCode.Created,
            await ownerRegistration.Content.ReadAsStringAsync());
        await AuthTestHelper.ConfirmEmailAsync(factory.Services, email);
        await Csrf(client);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync("/api/auth/login", new
            { email, password = "Password1", rememberMe = false })).StatusCode);
        await Csrf(client);
        var blockedCreate = await client.PostAsJsonAsync("/api/groups", new { name = "Blocked Billing Test Group" });
        Assert.Equal(HttpStatusCode.Conflict, blockedCreate.StatusCode);
        using (var blockedBody = JsonDocument.Parse(await blockedCreate.Content.ReadAsStringAsync()))
            Assert.Equal("billing-active-plan-required", blockedBody.RootElement.GetProperty("detail").GetString());

        await Csrf(client);
        using var studioTrial = await client.PostAsJsonAsync("/api/billing/organizations/trial", new { planId = "studio" });
        Assert.Equal(HttpStatusCode.BadRequest, studioTrial.StatusCode);

        await Csrf(client);
        using var trialResponse = await client.PostAsJsonAsync("/api/billing/organizations/trial", new { planId = "pro" });
        Assert.Equal(HttpStatusCode.OK, trialResponse.StatusCode);
        using var trialBody = JsonDocument.Parse(await trialResponse.Content.ReadAsStringAsync());
        Assert.Equal("trialing", trialBody.RootElement.GetProperty("status").GetString());
        Assert.Equal("pro", trialBody.RootElement.GetProperty("planId").GetString());
        Assert.False(trialBody.RootElement.GetProperty("hasSubscription").GetBoolean());
        Assert.True(trialBody.RootElement.GetProperty("trialEndsAt").GetDateTimeOffset() > DateTimeOffset.UtcNow);

        await Csrf(client);
        var created = await client.PostAsJsonAsync("/api/groups", new { name = "Billing Test Group" });
        Assert.True(created.StatusCode == HttpStatusCode.Created, await created.Content.ReadAsStringAsync());
        using var group = JsonDocument.Parse(await created.Content.ReadAsStringAsync());
        var groupId = group.RootElement.GetProperty("id").GetGuid();

        var summary = await client.GetAsync($"/api/groups/{groupId}/billing");
        Assert.Equal(HttpStatusCode.OK, summary.StatusCode);
        using var body = JsonDocument.Parse(await summary.Content.ReadAsStringAsync());
        Assert.True(body.RootElement.GetProperty("canManage").GetBoolean());
        Assert.True(body.RootElement.GetProperty("canCreate").GetBoolean());
        Assert.Equal("pro", body.RootElement.GetProperty("planId").GetString());

        var ownedOrganizations = await client.GetAsync("/api/billing/organizations");
        Assert.Equal(HttpStatusCode.OK, ownedOrganizations.StatusCode);
        using var organizationsBody = JsonDocument.Parse(await ownedOrganizations.Content.ReadAsStringAsync());
        var organizationId = organizationsBody.RootElement[0].GetProperty("organizationId").GetGuid();
        Assert.Equal(body.RootElement.GetProperty("organizationId").GetGuid(), organizationId);
        await Csrf(client);
        using var referralResponse = await client.PostAsJsonAsync($"/api/billing/organizations/{organizationId}/referral-code", new { });
        Assert.Equal(HttpStatusCode.OK, referralResponse.StatusCode);
        using var referralBody = JsonDocument.Parse(await referralResponse.Content.ReadAsStringAsync());
        var referralCode = referralBody.RootElement.GetProperty("referralCode").GetString()!;
        Assert.Matches("^[A-HJ-NP-Z2-9]{3}(-[A-HJ-NP-Z2-9]{3}){4}$", referralCode);
        await Csrf(client);
        using var stableReferralResponse = await client.PostAsJsonAsync($"/api/billing/organizations/{organizationId}/referral-code", new { });
        using var stableReferralBody = JsonDocument.Parse(await stableReferralResponse.Content.ReadAsStringAsync());
        Assert.Equal(referralCode, stableReferralBody.RootElement.GetProperty("referralCode").GetString());
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SonivoDbContext>();
            var storedCode = await db.BillingReferralCodes.SingleAsync(x => x.OrganizationId == organizationId);
            storedCode.Code = "abcdef1234567890abcdef12";
            await db.SaveChangesAsync();
        }
        await Csrf(client);
        using var repeatedReferralResponse = await client.PostAsJsonAsync($"/api/billing/organizations/{organizationId}/referral-code", new { });
        using var repeatedReferralBody = JsonDocument.Parse(await repeatedReferralResponse.Content.ReadAsStringAsync());
        referralCode = repeatedReferralBody.RootElement.GetProperty("referralCode").GetString()!;
        Assert.Equal("ABCD-EF12-3456-7890-ABCD-EF12", referralCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await factory.CreateClient().GetAsync(
            $"/api/admin/billing/organizations/{organizationId}/grants")).StatusCode);
        await Csrf(client);
        var forbiddenGrant = await client.PostAsJsonAsync($"/api/admin/billing/organizations/{organizationId}/grants",
            new { operationId = Guid.NewGuid(), planId = "studio", expiresAt = DateTimeOffset.UtcNow.AddDays(1), reason = "test" });
        Assert.Equal(HttpStatusCode.Forbidden, forbiddenGrant.StatusCode);
        await Csrf(client);
        var ownerPortal = await client.PostAsJsonAsync($"/api/billing/organizations/{organizationId}/portal",
            new { operationId = Guid.NewGuid().ToString() });
        Assert.Equal(HttpStatusCode.Conflict, ownerPortal.StatusCode);

        using var stranger = factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false, HandleCookies = true });
        await Csrf(stranger);
        var strangerEmail = $"stripe-stranger-{Guid.NewGuid():N}@example.com";
        Assert.Equal(HttpStatusCode.Created, (await stranger.PostAsJsonAsync("/api/auth/register", new
            { email = strangerEmail, password = "Password1", displayName = "Stranger" })).StatusCode);
        await AuthTestHelper.ConfirmEmailAsync(factory.Services, strangerEmail);
        await Csrf(stranger);
        Assert.Equal(HttpStatusCode.OK, (await stranger.PostAsJsonAsync("/api/auth/login", new
            { email = strangerEmail, password = "Password1", rememberMe = false })).StatusCode);
        await Csrf(stranger);
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.GetAsync($"/api/groups/{groupId}/billing")).StatusCode);
        using var strangerOrganizations = JsonDocument.Parse(await stranger.GetStringAsync("/api/billing/organizations"));
        Assert.Empty(strangerOrganizations.RootElement.EnumerateArray());
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.PostAsJsonAsync(
            $"/api/billing/organizations/{organizationId}/portal", new { operationId = Guid.NewGuid().ToString() })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.PostAsJsonAsync($"/api/groups/{groupId}/billing/portal",
            new { operationId = Guid.NewGuid().ToString() })).StatusCode);

        await Csrf(stranger);
        var strangerBlockedCreate = await stranger.PostAsJsonAsync("/api/groups", new { name = "Blocked Referred Group" });
        Assert.Equal(HttpStatusCode.Conflict, strangerBlockedCreate.StatusCode);
        await Csrf(stranger);
        using var strangerTrial = await stranger.PostAsJsonAsync("/api/billing/organizations/trial", new { planId = "pro" });
        Assert.Equal(HttpStatusCode.OK, strangerTrial.StatusCode);
        await Csrf(stranger);
        var strangerGroup = await stranger.PostAsJsonAsync("/api/groups", new { name = "Referred Group" });
        Assert.Equal(HttpStatusCode.Created, strangerGroup.StatusCode);
        using var strangerAccounts = JsonDocument.Parse(await stranger.GetStringAsync("/api/billing/organizations"));
        var strangerOrganizationId = strangerAccounts.RootElement[0].GetProperty("organizationId").GetGuid();
        await Csrf(stranger);
        var attributed = await stranger.PostAsJsonAsync(
            $"/api/billing/organizations/{strangerOrganizationId}/referrals/attribute", new { code = referralCode.ToLowerInvariant() });
        Assert.Equal(HttpStatusCode.OK, attributed.StatusCode);
        await Csrf(stranger);
        var duplicateAttribution = await stranger.PostAsJsonAsync(
            $"/api/billing/organizations/{strangerOrganizationId}/referrals/attribute", new { code = referralCode });
        Assert.Equal(HttpStatusCode.Conflict, duplicateAttribution.StatusCode);

        var assignment = await client.PutAsJsonAsync($"/api/groups/{groupId}/plan", new { action = "assign", planId = "studio" });
        Assert.True(assignment.StatusCode is HttpStatusCode.Forbidden or HttpStatusCode.Conflict,
            $"Manual assignment was not rejected: {(int)assignment.StatusCode} {await assignment.Content.ReadAsStringAsync()}");

        var checkout = await client.PostAsJsonAsync($"/api/groups/{groupId}/billing/checkout", new
            { planId = "pro", interval = "month", extraGroups = 0, operationId = Guid.NewGuid().ToString(), recurringConsent = false });
        Assert.Equal(HttpStatusCode.BadRequest, checkout.StatusCode);
        checkout = await client.PostAsJsonAsync($"/api/groups/{groupId}/billing/checkout", new
            { planId = "pro", interval = "month", extraGroups = 0, operationId = Guid.NewGuid().ToString(), recurringConsent = true });
        Assert.Equal(HttpStatusCode.Conflict, checkout.StatusCode);
        var nullCheckout = await client.PostAsJsonAsync($"/api/groups/{groupId}/billing/checkout", (object?)null);
        Assert.Equal(HttpStatusCode.BadRequest, nullCheckout.StatusCode);

        var malformedChange = await client.PostAsJsonAsync($"/api/groups/{groupId}/billing/change", new
            { operationId = Guid.NewGuid().ToString(), selection = (string?)null, quoteId = "invalid", recurringConsent = false });
        Assert.Equal(HttpStatusCode.BadRequest, malformedChange.StatusCode);
        var changeWithoutConsent = await client.PostAsJsonAsync($"/api/groups/{groupId}/billing/change", new
            { operationId = Guid.NewGuid().ToString(), selection = new { planId = "pro", interval = "month", extraGroups = 0 }, quoteId = "invalid", recurringConsent = false });
        Assert.Equal(HttpStatusCode.BadRequest, changeWithoutConsent.StatusCode);
        var changeWithConsent = await client.PostAsJsonAsync($"/api/groups/{groupId}/billing/change", new
            { operationId = Guid.NewGuid().ToString(), selection = new { planId = "pro", interval = "month", extraGroups = 0 }, quoteId = "invalid", recurringConsent = true });
        Assert.Equal(HttpStatusCode.Conflict, changeWithConsent.StatusCode);
        var nullChange = await client.PostAsJsonAsync($"/api/groups/{groupId}/billing/change", (object?)null);
        Assert.Equal(HttpStatusCode.BadRequest, nullChange.StatusCode);

        var webhook = await client.PostAsJsonAsync("/api/payments/webhook", new { id = "evt_forged" });
        Assert.Equal(HttpStatusCode.BadRequest, webhook.StatusCode);
    }

    private static async Task Csrf(HttpClient client)
    {
        using var response = await client.GetAsync("/api/auth/csrf");
        response.EnsureSuccessStatusCode();
        using var payload = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        client.DefaultRequestHeaders.Remove("X-CSRF-TOKEN");
        client.DefaultRequestHeaders.Add("X-CSRF-TOKEN", payload.RootElement.GetProperty("token").GetString());
    }
}

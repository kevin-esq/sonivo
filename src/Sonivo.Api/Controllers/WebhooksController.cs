using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Sonivo.Domain.Payments;
using Sonivo.Infrastructure.Persistence;

namespace Sonivo.Api.Controllers;

[ApiController]
[Route("api/webhooks")]
[AllowAnonymous]
public class WebhooksController : ControllerBase
{
    private readonly SonivoDbContext _dbContext;
    private readonly IConfiguration _configuration;
    private readonly ILogger<WebhooksController> _logger;

    public WebhooksController(
        SonivoDbContext dbContext,
        IConfiguration configuration,
        ILogger<WebhooksController> logger)
    {
        _dbContext = dbContext;
        _configuration = configuration;
        _logger = logger;
    }

    [HttpPost("stripe")]
    public async Task<IActionResult> HandleStripeWebhook()
    {
        var body = await new StreamReader(HttpContext.Request.Body).ReadToEndAsync();
        var signature = Request.Headers["Stripe-Signature"].ToString();
        var webhookSecret = _configuration["Payments:Stripe:WebhookSecret"] ?? "whsec_stub_key";

        if (string.IsNullOrEmpty(signature) && !webhookSecret.StartsWith("whsec_stub"))
        {
            return BadRequest(new { error = "Falta la cabecera Stripe-Signature." });
        }

        var eventId = Request.Headers["X-Stripe-Event-Id"].ToString();
        if (string.IsNullOrEmpty(eventId))
        {
            eventId = $"evt_stripe_{Guid.NewGuid():N}";
        }

        // 1. Verificación de Idempotencia en PostgreSQL
        var existingLog = await _dbContext.WebhookEventLogs
            .FirstOrDefaultAsync(w => w.EventId == eventId && w.Provider == "Stripe");

        if (existingLog != null)
        {
            _logger.LogInformation("Webhook idempotente ya procesado previamente: {EventId}", eventId);
            return Ok(new { status = "already_processed", eventId });
        }

        // 2. Registrar evento procesado
        _dbContext.WebhookEventLogs.Add(new WebhookEventLog
        {
            Id = Guid.NewGuid(),
            EventId = eventId,
            Provider = "Stripe",
            EventType = "customer.subscription.updated",
            ProcessedAtUtc = DateTime.UtcNow
        });

        await _dbContext.SaveChangesAsync();
        return Ok(new { status = "processed", eventId });
    }

    [HttpPost("mercadopago")]
    public async Task<IActionResult> HandleMercadoPagoWebhook()
    {
        var eventId = Request.Query["id"].ToString();
        if (string.IsNullOrEmpty(eventId))
        {
            eventId = $"evt_mp_{Guid.NewGuid():N}";
        }

        // 1. Verificación de Idempotencia en PostgreSQL
        var existingLog = await _dbContext.WebhookEventLogs
            .FirstOrDefaultAsync(w => w.EventId == eventId && w.Provider == "MercadoPago");

        if (existingLog != null)
        {
            return Ok(new { status = "already_processed", eventId });
        }

        // 2. Registrar evento procesado
        _dbContext.WebhookEventLogs.Add(new WebhookEventLog
        {
            Id = Guid.NewGuid(),
            EventId = eventId,
            Provider = "MercadoPago",
            EventType = "payment.updated",
            ProcessedAtUtc = DateTime.UtcNow
        });

        await _dbContext.SaveChangesAsync();
        return Ok(new { status = "processed", eventId });
    }
}

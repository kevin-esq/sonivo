using System.Collections.Concurrent;
using System.Net;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Logging;
using Npgsql;

namespace Sonivo.Api.Tests;

public sealed class RlsStartupVerificationTests
{
    [Fact]
    public void Production_host_rejects_an_in_memory_database()
    {
        using var factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment("Production");
            builder.UseSetting("UseInMemoryDatabase", "true");
        });

        var exception = Record.Exception(() => factory.CreateClient());

        Assert.NotNull(exception);
        Assert.Contains("UseInMemoryDatabase is not allowed in Production", exception.ToString(), StringComparison.Ordinal);
    }

    [Fact]
    public void Production_host_rejects_a_privileged_database_principal()
    {
        var connectionString = Environment.GetEnvironmentVariable("SONIVO_TEST_PG");
        if (string.IsNullOrWhiteSpace(connectionString)) return;

        using var factory = CreateProductionFactory(connectionString);
        var exception = Record.Exception(() => factory.CreateClient());

        Assert.NotNull(exception);
        Assert.Contains("RLS runtime verification failed", exception.ToString(), StringComparison.Ordinal);
    }

    [Fact]
    public async Task Production_host_starts_with_the_constrained_runtime_principal()
    {
        var connectionString = Environment.GetEnvironmentVariable("SONIVO_RLS_TEST_PG");
        if (string.IsNullOrWhiteSpace(connectionString)) return;

        using var logs = new CapturingLoggerProvider();
        using var factory = CreateProductionFactory(connectionString, logs);
        using var client = factory.CreateClient();
        using var response = await client.GetAsync("/api/health/ready");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Contains(logs.Messages, message =>
            message == "RLS runtime principal and forced-policy verification passed.");
        Assert.DoesNotContain(logs.Messages, message => message.Contains(connectionString, StringComparison.Ordinal));
    }

    [Fact]
    public async Task Production_host_rejects_a_table_without_forced_row_security()
    {
        var ownerConnectionString = Environment.GetEnvironmentVariable("SONIVO_TEST_PG");
        var runtimeConnectionString = Environment.GetEnvironmentVariable("SONIVO_RLS_TEST_PG");
        if (string.IsNullOrWhiteSpace(ownerConnectionString)
            || string.IsNullOrWhiteSpace(runtimeConnectionString)) return;

        await using var ownerConnection = new NpgsqlConnection(ownerConnectionString);
        await ownerConnection.OpenAsync();
        await using (var disableRls = new NpgsqlCommand(
            "ALTER TABLE public.\"Groups\" DISABLE ROW LEVEL SECURITY",
            ownerConnection))
        {
            await disableRls.ExecuteNonQueryAsync();
        }

        Exception? exception = null;
        try
        {
            using var factory = CreateProductionFactory(runtimeConnectionString);
            exception = Record.Exception(() => factory.CreateClient());
        }
        finally
        {
            await using var restoreRls = new NpgsqlCommand(
                "ALTER TABLE public.\"Groups\" ENABLE ROW LEVEL SECURITY; ALTER TABLE public.\"Groups\" FORCE ROW LEVEL SECURITY",
                ownerConnection);
            await restoreRls.ExecuteNonQueryAsync();
        }

        Assert.NotNull(exception);
        Assert.Contains("RLS runtime verification failed", exception.ToString(), StringComparison.Ordinal);

        using var recoveredFactory = CreateProductionFactory(runtimeConnectionString);
        using var recoveredClient = recoveredFactory.CreateClient();
        using var recoveredResponse = await recoveredClient.GetAsync("/api/health/ready");

        Assert.Equal(HttpStatusCode.OK, recoveredResponse.StatusCode);
    }

    private static WebApplicationFactory<Program> CreateProductionFactory(
        string connectionString,
        ILoggerProvider? loggerProvider = null) =>
        new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment("Production");
            builder.UseSetting("UseInMemoryDatabase", "false");
            builder.UseSetting("SONIVO_MIGRATE_ON_START", "false");
            builder.UseSetting("ConnectionStrings:Default", connectionString);
            if (loggerProvider is not null)
            {
                builder.ConfigureLogging(logging => logging.AddProvider(loggerProvider));
            }
        });

    private sealed class CapturingLoggerProvider : ILoggerProvider
    {
        private readonly ConcurrentQueue<string> _messages = new();

        public IReadOnlyCollection<string> Messages => _messages.ToArray();

        public ILogger CreateLogger(string categoryName) => new CapturingLogger(this, categoryName);

        public void Dispose()
        {
        }

        private void Capture(string categoryName, LogLevel logLevel, string message)
        {
            if (categoryName == "Sonivo.Infrastructure.Persistence.RlsRuntimePrincipalStartupVerifier"
                && logLevel == LogLevel.Information)
            {
                _messages.Enqueue(message);
            }
        }

        private sealed class CapturingLogger(CapturingLoggerProvider provider, string categoryName) : ILogger
        {
            public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

            public bool IsEnabled(LogLevel logLevel) => logLevel == LogLevel.Information;

            public void Log<TState>(
                LogLevel logLevel,
                EventId eventId,
                TState state,
                Exception? exception,
                Func<TState, Exception?, string> formatter)
            {
                provider.Capture(categoryName, logLevel, formatter(state, null));
            }
        }
    }
}

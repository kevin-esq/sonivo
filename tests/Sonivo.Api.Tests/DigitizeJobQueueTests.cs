using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Sonivo.Api.Realtime;
using Sonivo.Application.Abstractions;
using Sonivo.Application.Repertoire;

namespace Sonivo.Api.Tests;

public sealed class DigitizeJobQueueTests
{
    [Fact]
    public async Task Full_queue_rejects_job_and_marks_it_failed()
    {
        var store = new RecordingDigitizeJobStore();
        var services = new ServiceCollection();
        services.AddSingleton<IDigitizeJobStore>(store);
        using var provider = services.BuildServiceProvider();
        var queue = new DigitizeJobQueue(
            provider.GetRequiredService<IServiceScopeFactory>(),
            NullLogger<DigitizeJobQueue>.Instance);

        for (var index = 0; index < 16; index++)
        {
            Assert.True(await queue.TryEnqueueAsync(Guid.NewGuid(), CancellationToken.None));
        }

        var rejectedJobId = Guid.NewGuid();
        Assert.False(await queue.TryEnqueueAsync(rejectedJobId, CancellationToken.None));
        Assert.Equal(rejectedJobId, store.FailedJobId);
        Assert.Equal(DigitizeJobErrorCodes.QueueFull, store.ErrorCode);
    }

    private sealed class RecordingDigitizeJobStore : IDigitizeJobStore
    {
        public Guid? FailedJobId { get; private set; }
        public string? ErrorCode { get; private set; }

        public DigitizeJob Create(Guid userId, Guid groupId, Guid arrangementId, Guid resourceId, DateTimeOffset now)
            => throw new NotSupportedException();

        public DigitizeJob? Get(Guid jobId, DateTimeOffset now)
            => throw new NotSupportedException();

        public DigitizeJob? GetScoped(Guid jobId, Guid groupId, Guid arrangementId, DateTimeOffset now)
            => throw new NotSupportedException();

        public bool TryTransitionToProcessing(Guid jobId, DateTimeOffset now)
            => throw new NotSupportedException();

        public void Complete(Guid jobId, IReadOnlyList<DigitizeJobSegment> segments)
            => throw new NotSupportedException();

        public void Fail(Guid jobId, string errorCode)
        {
            FailedJobId = jobId;
            ErrorCode = errorCode;
        }
    }
}

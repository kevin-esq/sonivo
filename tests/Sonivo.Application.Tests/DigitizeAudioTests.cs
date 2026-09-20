using System.Text;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Sonivo.Application.Abstractions;
using Sonivo.Application.Repertoire;
using Sonivo.Application.Tenancy;
using Sonivo.Domain.Repertoire;
using Sonivo.Domain.Tenancy;

namespace Sonivo.Application.Tests;

/// <summary>
/// T-W32-01: digitizer caps, eligibility, segment→mark shaping, job lifecycle.
/// No model download anywhere — transcription runs against a fake.
/// </summary>
public class DigitizeAudioTests
{
    private static readonly DateTimeOffset Now = DateTimeOffset.Parse("2026-09-20T12:00:00Z");

    // ---- Eligibility ----

    [Theory]
    [InlineData(ResourcePurposes.Audio)]
    [InlineData(ResourcePurposes.Practice)]
    [InlineData(ResourcePurposes.Click)]
    public void Audio_file_with_digitizable_purpose_is_eligible(string purpose)
    {
        var resource = FileResource(Guid.NewGuid(), purpose, "audio/mpeg", "guia.mp3", 1024);
        Assert.Null(DigitizeEligibility.RejectReason(resource));
    }

    [Fact]
    public void Link_resource_is_rejected_with_clear_error()
    {
        var resource = Resource.CreateLink(
            Guid.NewGuid(), ResourcePurposes.Audio, "Ref", "https://example.com/a.mp3", Now);
        var reason = DigitizeEligibility.RejectReason(resource);
        Assert.NotNull(reason);
        Assert.Contains("enlace", reason, StringComparison.OrdinalIgnoreCase);
    }

    [Theory]
    [InlineData(ResourcePurposes.Chart)]
    [InlineData(ResourcePurposes.Lyrics)]
    [InlineData(ResourcePurposes.Reference)]
    [InlineData(ResourcePurposes.Other)]
    public void Non_audio_purpose_is_rejected(string purpose)
    {
        var resource = FileResource(Guid.NewGuid(), purpose, "audio/mpeg", "guia.mp3", 1024);
        Assert.NotNull(DigitizeEligibility.RejectReason(resource));
    }

    [Fact]
    public void Non_audio_mime_is_rejected()
    {
        var resource = FileResource(Guid.NewGuid(), ResourcePurposes.Audio, "application/pdf", "chart.pdf", 1024);
        var reason = DigitizeEligibility.RejectReason(resource);
        Assert.NotNull(reason);
        Assert.Contains("audio", reason, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Playability_falls_back_to_audio_extension()
    {
        Assert.True(DigitizeEligibility.IsPlayableAudio("application/octet-stream", "demo.WAV"));
        Assert.False(DigitizeEligibility.IsPlayableAudio("application/octet-stream", "chart.pdf"));
        Assert.True(DigitizeEligibility.IsPlayableAudio("audio/mpeg", "no-ext"));
    }

    // ---- Segment shaping ----

    [Fact]
    public void Clean_trims_and_drops_blank_segments()
    {
        var cleaned = DigitizeSegmentMapper.Clean([
            new TranscribedSegment(0, 1000, "  Hola  "),
            new TranscribedSegment(1000, 2000, "   "),
            new TranscribedSegment(2000, 3000, "[MÚSICA]"),
        ]);

        Assert.Equal(2, cleaned.Count);
        Assert.Equal("Hola", cleaned[0].Text);
        Assert.Equal("[MÚSICA]", cleaned[1].Text);
    }

    [Fact]
    public void Clean_rejects_negative_times()
    {
        Assert.Throws<TranscriptionException>(() =>
            DigitizeSegmentMapper.Clean([new TranscribedSegment(-5, 100, "x")]));
        Assert.Throws<TranscriptionException>(() =>
            DigitizeSegmentMapper.Clean([new TranscribedSegment(200, 100, "x")]));
    }

    [Fact]
    public void ToTimingMarks_uses_startMs_with_owner_line_assignment()
    {
        var segments = DigitizeSegmentMapper.Clean([
            new TranscribedSegment(0, 3000, "[MÚSICA]"),
            new TranscribedSegment(3500, 5000, "Santo"),
        ]);

        var marks = DigitizeSegmentMapper.ToTimingMarks(segments, i => i + 1);

        Assert.Equal([new TimingMarkDraft(1, 0), new TimingMarkDraft(2, 3500)], marks);
    }

    [Fact]
    public void ToLyricsDraft_joins_one_segment_per_line()
    {
        var draft = DigitizeSegmentMapper.ToLyricsDraft([
            new TranscribedSegment(0, 1000, "Santo"),
            new TranscribedSegment(1000, 2000, "Santo eres"),
        ]);
        Assert.Equal("Santo\nSanto eres", draft);
    }

    // ---- WAV decode ----

    [Fact]
    public void Wav_decode_resamples_8k_to_16k_mono()
    {
        var bytes = BuildPcmWav(sampleRate: 8000, channels: 1, seconds: 1);
        var samples = WavAudio.DecodeToMono16k(bytes, maxAudioSeconds: 120);
        Assert.Equal(16_000, samples.Length);
    }

    [Fact]
    public void Wav_decode_downmixes_stereo()
    {
        var bytes = BuildPcmWav(sampleRate: 16_000, channels: 2, seconds: 1);
        var (samples, rate) = WavAudio.DecodeToMono(bytes);
        Assert.Equal(16_000, rate);
        Assert.Equal(16_000, samples.Length);
    }

    [Fact]
    public void Wav_decode_rejects_non_wav_with_clear_error()
    {
        var ex = Assert.Throws<TranscriptionException>(() =>
            WavAudio.DecodeToMono16k(Encoding.ASCII.GetBytes("ID3garbage-bytes"), 120));
        Assert.Contains("WAV", ex.Message);
    }

    [Fact]
    public void Wav_decode_enforces_duration_cap()
    {
        var bytes = BuildPcmWav(sampleRate: 8000, channels: 1, seconds: 3);
        var ex = Assert.Throws<TranscriptionException>(() => WavAudio.DecodeToMono16k(bytes, 2));
        Assert.Contains("2 s", ex.Message);
    }

    // ---- Job store ----

    [Fact]
    public void Job_store_scopes_and_expires()
    {
        var store = new InMemoryDigitizeJobStore(new FixedClock(Now));
        var groupId = Guid.NewGuid();
        var arrangementId = Guid.NewGuid();
        var job = store.Create(groupId, arrangementId, Guid.NewGuid(), Now);

        Assert.NotNull(store.GetScoped(job.Id, groupId, arrangementId, Now));
        Assert.Null(store.GetScoped(job.Id, Guid.NewGuid(), arrangementId, Now));
        Assert.Null(store.GetScoped(job.Id, groupId, Guid.NewGuid(), Now));

        Assert.True(store.TryTransitionToProcessing(job.Id, Now));
        Assert.False(store.TryTransitionToProcessing(job.Id, Now));

        Assert.Null(store.Get(job.Id, Now.AddMinutes(31)));
    }

    // ---- Handlers ----

    [Fact]
    public async Task Start_rejects_link_resource_with_clear_error()
    {
        var ctx = SeedOwnerWithArrangement();
        var link = Resource.CreateLink(ctx.ArrangementId, ResourcePurposes.Audio, "Ref", "https://example.com/a.mp3", Now);
        ctx.Resources.Add(link);

        var handler = new StartDigitizeJobHandler(
            new GroupAccessService(ctx.Groups), ctx.Arrangements, ctx.Resources,
            new InMemoryDigitizeJobStore(new FixedClock(Now)), new FixedClock(Now));

        var ex = await Assert.ThrowsAsync<ValidationException>(() =>
            handler.HandleAsync(new StartDigitizeJobCommand(ctx.Owner, ctx.GroupId, ctx.ArrangementId, link.Id), CancellationToken.None));
        Assert.Contains("enlace", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Start_requires_owner_and_known_resource()
    {
        var ctx = await SeedOwnerMemberWithArrangementAsync();
        var file = FileResource(ctx.ArrangementId, ResourcePurposes.Audio, "audio/mpeg", "g.mp3", 64);
        ctx.Resources.Add(file);

        var handler = new StartDigitizeJobHandler(
            new GroupAccessService(ctx.Groups), ctx.Arrangements, ctx.Resources,
            new InMemoryDigitizeJobStore(new FixedClock(Now)), new FixedClock(Now));

        await Assert.ThrowsAsync<ForbiddenException>(() =>
            handler.HandleAsync(new StartDigitizeJobCommand(ctx.Member, ctx.GroupId, ctx.ArrangementId, file.Id), CancellationToken.None));
        await Assert.ThrowsAsync<NotFoundException>(() =>
            handler.HandleAsync(new StartDigitizeJobCommand(ctx.Owner, ctx.GroupId, ctx.ArrangementId, Guid.NewGuid()), CancellationToken.None));
        await Assert.ThrowsAsync<NotFoundException>(() =>
            handler.HandleAsync(new StartDigitizeJobCommand(Guid.NewGuid(), ctx.GroupId, ctx.ArrangementId, file.Id), CancellationToken.None));
    }

    [Fact]
    public async Task Runner_completes_job_and_never_writes_arrangement()
    {
        var ctx = await SeedOwnerMemberWithArrangementAsync();
        var file = FileResource(ctx.ArrangementId, ResourcePurposes.Audio, "audio/wav", "g.wav", 64, objectKey: "resources/audio-1");
        ctx.Resources.Add(file);
        ctx.Blobs.Add("resources/audio-1", new byte[] { 1, 2, 3 });

        var fake = new FakeTranscriber(_ =>
            [new TranscribedSegment(0, 3000, "[MÚSICA]"), new TranscribedSegment(3500, 5000, "Santo")]);
        var (runner, jobs) = Runner(ctx, fake);
        var versionBefore = ctx.Arrangements.Items.Single().Version;

        var started = await new StartDigitizeJobHandler(
                new GroupAccessService(ctx.Groups), ctx.Arrangements, ctx.Resources, jobs, new FixedClock(Now))
            .HandleAsync(new StartDigitizeJobCommand(ctx.Owner, ctx.GroupId, ctx.ArrangementId, file.Id), CancellationToken.None);

        await runner.ProcessAsync(started.JobId, CancellationToken.None);

        var job = await new GetDigitizeJobHandler(
                new GroupAccessService(ctx.Groups), ctx.Arrangements, jobs, new FixedClock(Now))
            .HandleAsync(ctx.Owner, ctx.GroupId, ctx.ArrangementId, started.JobId, CancellationToken.None);

        Assert.Equal("done", job.Status);
        Assert.NotNull(job.Segments);
        Assert.Equal(2, job.Segments.Count);
        Assert.Equal(0, job.Segments[0].StartMs);
        Assert.Null(job.Error);
        Assert.Equal(versionBefore, ctx.Arrangements.Items.Single().Version);
        Assert.Null(ctx.Arrangements.Items.Single().ChordTimingJson);
    }

    [Fact]
    public async Task Runner_fails_cleanly_over_segment_cap()
    {
        var ctx = await SeedOwnerMemberWithArrangementAsync();
        var file = FileResource(ctx.ArrangementId, ResourcePurposes.Audio, "audio/wav", "g.wav", 64, objectKey: "k");
        ctx.Resources.Add(file);
        ctx.Blobs.Add("k", [1]);

        var tooMany = Enumerable.Range(0, DigitizeSegmentMapper.MaxSegments + 1)
            .Select(i => new TranscribedSegment(i * 100, i * 100 + 50, $"w{i}"))
            .ToList();
        var (runner, jobs) = Runner(ctx, new FakeTranscriber(_ => tooMany));

        var started = await new StartDigitizeJobHandler(
                new GroupAccessService(ctx.Groups), ctx.Arrangements, ctx.Resources, jobs, new FixedClock(Now))
            .HandleAsync(new StartDigitizeJobCommand(ctx.Owner, ctx.GroupId, ctx.ArrangementId, file.Id), CancellationToken.None);
        await runner.ProcessAsync(started.JobId, CancellationToken.None);

        var job = jobs.Get(started.JobId, Now)!;
        Assert.Equal(DigitizeJobStatus.Failed, job.Status);
        Assert.Contains("500", job.Error);
        Assert.Empty(job.Segments);
    }

    [Fact]
    public async Task Runner_fails_cleanly_over_duration_cap()
    {
        var ctx = await SeedOwnerMemberWithArrangementAsync();
        var file = FileResource(ctx.ArrangementId, ResourcePurposes.Audio, "audio/wav", "g.wav", 64, objectKey: "k");
        ctx.Resources.Add(file);
        ctx.Blobs.Add("k", [1]);

        var (runner, jobs) = Runner(
            ctx,
            new FakeTranscriber(_ => [new TranscribedSegment(0, 121_000, "largo")]),
            maxAudioSeconds: 120);

        var started = await new StartDigitizeJobHandler(
                new GroupAccessService(ctx.Groups), ctx.Arrangements, ctx.Resources, jobs, new FixedClock(Now))
            .HandleAsync(new StartDigitizeJobCommand(ctx.Owner, ctx.GroupId, ctx.ArrangementId, file.Id), CancellationToken.None);
        await runner.ProcessAsync(started.JobId, CancellationToken.None);

        var job = jobs.Get(started.JobId, Now)!;
        Assert.Equal(DigitizeJobStatus.Failed, job.Status);
        Assert.Contains("120", job.Error);
    }

    [Fact]
    public async Task Runner_maps_transcriber_failure_to_failed_job()
    {
        var ctx = await SeedOwnerMemberWithArrangementAsync();
        var file = FileResource(ctx.ArrangementId, ResourcePurposes.Audio, "audio/wav", "g.wav", 64, objectKey: "k");
        ctx.Resources.Add(file);
        ctx.Blobs.Add("k", [1]);

        var (runner, jobs) = Runner(ctx, new FakeTranscriber(_ => throw new TranscriptionException("Audio ilegible.")));

        var started = await new StartDigitizeJobHandler(
                new GroupAccessService(ctx.Groups), ctx.Arrangements, ctx.Resources, jobs, new FixedClock(Now))
            .HandleAsync(new StartDigitizeJobCommand(ctx.Owner, ctx.GroupId, ctx.ArrangementId, file.Id), CancellationToken.None);
        await runner.ProcessAsync(started.JobId, CancellationToken.None);

        var job = jobs.Get(started.JobId, Now)!;
        Assert.Equal(DigitizeJobStatus.Failed, job.Status);
        Assert.Equal("Audio ilegible.", job.Error);
    }

    [Fact]
    public async Task Get_job_scopes_to_group_and_arrangement()
    {
        var ctx = await SeedOwnerMemberWithArrangementAsync();
        var file = FileResource(ctx.ArrangementId, ResourcePurposes.Audio, "audio/wav", "g.wav", 64, objectKey: "k");
        ctx.Resources.Add(file);
        var jobs = new InMemoryDigitizeJobStore(new FixedClock(Now));

        var started = await new StartDigitizeJobHandler(
                new GroupAccessService(ctx.Groups), ctx.Arrangements, ctx.Resources, jobs, new FixedClock(Now))
            .HandleAsync(new StartDigitizeJobCommand(ctx.Owner, ctx.GroupId, ctx.ArrangementId, file.Id), CancellationToken.None);

        var get = new GetDigitizeJobHandler(
            new GroupAccessService(ctx.Groups), ctx.Arrangements, jobs, new FixedClock(Now));

        await Assert.ThrowsAsync<NotFoundException>(() =>
            get.HandleAsync(ctx.Owner, ctx.GroupId, Guid.NewGuid(), started.JobId, CancellationToken.None));
        await Assert.ThrowsAsync<ForbiddenException>(() =>
            get.HandleAsync(ctx.Member, ctx.GroupId, ctx.ArrangementId, started.JobId, CancellationToken.None));
    }

    // ---- Fixture ----

    private static Resource FileResource(
        Guid arrangementId,
        string purpose, string contentType, string fileName, long byteSize, string objectKey = "resources/k")
        => Resource.CreateFile(
            arrangementId, purpose, "Guía", fileName, contentType, byteSize, objectKey, Now);

    private static byte[] BuildPcmWav(int sampleRate, int channels, int seconds)
    {
        var frames = sampleRate * seconds;
        var data = new byte[frames * channels * 2];
        for (var i = 0; i < frames * channels; i++)
        {
            var value = (short)(Math.Sin(i * 0.1) * 9000);
            data[i * 2] = (byte)(value & 0xFF);
            data[i * 2 + 1] = (byte)((value >> 8) & 0xFF);
        }

        using var buffer = new MemoryStream();
        void WriteAscii(string text) => buffer.Write(Encoding.ASCII.GetBytes(text));
        void WriteInt32(int value)
        {
            buffer.WriteByte((byte)(value & 0xFF));
            buffer.WriteByte((byte)((value >> 8) & 0xFF));
            buffer.WriteByte((byte)((value >> 16) & 0xFF));
            buffer.WriteByte((byte)((value >> 24) & 0xFF));
        }

        void WriteInt16(short value)
        {
            buffer.WriteByte((byte)(value & 0xFF));
            buffer.WriteByte((byte)((value >> 8) & 0xFF));
        }

        WriteAscii("RIFF");
        WriteInt32(36 + data.Length);
        WriteAscii("WAVE");
        WriteAscii("fmt ");
        WriteInt32(16);
        WriteInt16(1);
        WriteInt16((short)channels);
        WriteInt32(sampleRate);
        WriteInt32(sampleRate * channels * 2);
        WriteInt16((short)(channels * 2));
        WriteInt16(16);
        WriteAscii("data");
        WriteInt32(data.Length);
        buffer.Write(data, 0, data.Length);
        return buffer.ToArray();
    }

    private static (DigitizeJobRunner Runner, InMemoryDigitizeJobStore Jobs) Runner(
        Fixture ctx, IAudioTranscriber transcriber, int maxAudioSeconds = 120)
    {
        var jobs = new InMemoryDigitizeJobStore(new FixedClock(Now));
        var options = Options.Create(new DigitizeOptions { MaxAudioSeconds = maxAudioSeconds });
        var runner = new DigitizeJobRunner(
            jobs, ctx.Arrangements, ctx.Resources, ctx.Blobs, transcriber,
            options, new FixedClock(Now), NullLogger<DigitizeJobRunner>.Instance);
        return (runner, jobs);
    }

    private static Fixture SeedOwnerWithArrangement()
    {
        var groups = new FakeGroupStore();
        var arrangements = new FakeArrangementStore();
        var resources = new FakeResourceStore();
        var blobs = new FakeBlobStore();
        var owner = Guid.NewGuid();
        var group = Group.Create("Band", Now);
        groups.Groups.Add(group);
        groups.Memberships.Add(Membership.CreateOwner(group.Id, owner, Now));

        var songId = Guid.NewGuid();
        var arrangement = Arrangement.Create(group.Id, songId, "Live", Now);
        arrangements.Items.Add(arrangement);
        return new Fixture(groups, arrangements, resources, blobs, owner, Guid.Empty, group.Id, arrangement.Id);
    }

    private static async Task<Fixture> SeedOwnerMemberWithArrangementAsync()
    {
        var ctx = SeedOwnerWithArrangement();
        await Task.CompletedTask;
        var member = Guid.NewGuid();
        ctx.Groups.Memberships.Add(Membership.CreateMember(ctx.GroupId, member, Now));
        return ctx with { Member = member };
    }

    private sealed record Fixture(
        FakeGroupStore Groups,
        FakeArrangementStore Arrangements,
        FakeResourceStore Resources,
        FakeBlobStore Blobs,
        Guid Owner,
        Guid Member,
        Guid GroupId,
        Guid ArrangementId);

    private sealed class FixedClock(DateTimeOffset now) : IClock
    {
        public DateTimeOffset UtcNow { get; } = now;
    }

    private sealed class FakeTranscriber(Func<Stream, IReadOnlyList<TranscribedSegment>> respond) : IAudioTranscriber
    {
        public Task<IReadOnlyList<TranscribedSegment>> TranscribeAsync(
            Stream audio, string contentType, CancellationToken cancellationToken)
            => Task.FromResult(respond(audio));
    }

    private sealed class FakeGroupStore : IGroupStore
    {
        public List<Group> Groups { get; } = [];
        public List<Membership> Memberships { get; } = [];

        public Task AddAsync(Group group, Membership ownerMembership, CancellationToken cancellationToken)
        {
            Groups.Add(group);
            Memberships.Add(ownerMembership);
            return Task.CompletedTask;
        }

        public Task<IReadOnlyList<GroupListItem>> ListForUserAsync(Guid userId, CancellationToken cancellationToken)
            => Task.FromResult<IReadOnlyList<GroupListItem>>([]);

        public Task<Group?> GetByIdAsync(Guid groupId, CancellationToken cancellationToken)
            => Task.FromResult(Groups.FirstOrDefault(g => g.Id == groupId && !g.IsDeleted));

        public Task<Membership?> GetMembershipAsync(Guid groupId, Guid userId, CancellationToken cancellationToken)
            => Task.FromResult(Memberships.FirstOrDefault(m => m.GroupId == groupId && m.UserId == userId));

        public Task AddMembershipAsync(Membership membership, CancellationToken cancellationToken)
        {
            Memberships.Add(membership);
            return Task.CompletedTask;
        }

        public Task UpdateAsync(Group group, CancellationToken cancellationToken) => Task.CompletedTask;
        public Task SaveChangesAsync(CancellationToken cancellationToken) => Task.CompletedTask;
    }

    private sealed class FakeArrangementStore : IArrangementStore
    {
        public List<Arrangement> Items { get; } = [];

        public Task AddAsync(Arrangement arrangement, CancellationToken cancellationToken)
        {
            Items.Add(arrangement);
            return Task.CompletedTask;
        }

        public Task<IReadOnlyList<Arrangement>> ListBySongAsync(Guid groupId, Guid songId, CancellationToken cancellationToken)
            => Task.FromResult<IReadOnlyList<Arrangement>>(Items.Where(a => a.GroupId == groupId).ToList());

        public Task<IReadOnlyList<Arrangement>> ListLiveTrackedBySongAsync(Guid groupId, Guid songId, CancellationToken cancellationToken)
            => ListBySongAsync(groupId, songId, cancellationToken);

        public Task<Arrangement?> GetByIdAsync(Guid groupId, Guid arrangementId, CancellationToken cancellationToken)
            => Task.FromResult(Items.FirstOrDefault(a => a.GroupId == groupId && a.Id == arrangementId && !a.IsDeleted));

        public Task<Arrangement?> GetByIdWithResourcesAsync(Guid groupId, Guid arrangementId, CancellationToken cancellationToken)
            => GetByIdAsync(groupId, arrangementId, cancellationToken);

        public Task UpdateAsync(Arrangement arrangement, CancellationToken cancellationToken) => Task.CompletedTask;
        public Task SaveChangesAsync(CancellationToken cancellationToken) => Task.CompletedTask;
    }

    private sealed class FakeResourceStore : IResourceStore
    {
        private readonly List<Resource> _items = [];
        public void Add(Resource resource) => _items.Add(resource);

        public Task AddAsync(Resource resource, CancellationToken cancellationToken)
        {
            _items.Add(resource);
            return Task.CompletedTask;
        }

        public Task<IReadOnlyList<Resource>> ListByArrangementAsync(Guid arrangementId, CancellationToken cancellationToken)
            => Task.FromResult<IReadOnlyList<Resource>>(_items.Where(r => r.ArrangementId == arrangementId).ToList());

        public Task<Resource?> GetByIdAsync(Guid arrangementId, Guid resourceId, CancellationToken cancellationToken)
            => Task.FromResult(_items.FirstOrDefault(r => r.ArrangementId == arrangementId && r.Id == resourceId));

        public Task UpdateAsync(Resource resource, CancellationToken cancellationToken) => Task.CompletedTask;
        public Task RemoveAsync(Resource resource, CancellationToken cancellationToken) => Task.CompletedTask;
        public Task SaveChangesAsync(CancellationToken cancellationToken) => Task.CompletedTask;
    }

    private sealed class FakeBlobStore : IBlobStore
    {
        private readonly Dictionary<string, byte[]> _blobs = new();
        public void Add(string objectKey, byte[] bytes) => _blobs[objectKey] = bytes;

        public Task PutAsync(string objectKey, Stream content, string contentType, long byteSize, CancellationToken cancellationToken)
            => Task.CompletedTask;

        public Task<BlobContent?> GetAsync(string objectKey, CancellationToken cancellationToken)
            => Task.FromResult(_blobs.TryGetValue(objectKey, out var bytes)
                ? new BlobContent(new MemoryStream(bytes, writable: false), "audio/wav", bytes.Length)
                : null);

        public Task DeleteAsync(string objectKey, CancellationToken cancellationToken) => Task.CompletedTask;
    }
}

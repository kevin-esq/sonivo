using Sonivo.Domain.Repertoire;

namespace Sonivo.Domain.Tests;

public class ResourceDomainTests
{
    private static readonly DateTimeOffset Now = DateTimeOffset.Parse("2026-09-15T12:00:00Z");
    private static readonly Guid ArrangementId = Guid.Parse("33333333-3333-3333-3333-333333333333");

    [Fact]
    public void CreateLink_sets_link_fields_and_null_file_columns()
    {
        var resource = Resource.CreateLink(
            ArrangementId,
            ResourcePurposes.Practice,
            "  Chart PDF  ",
            "  https://example.com/chart  ",
            Now,
            part: "  Guitar  ",
            note: "  rehearsal  ");

        Assert.NotEqual(Guid.Empty, resource.Id);
        Assert.Equal(ArrangementId, resource.ArrangementId);
        Assert.Equal(ResourceKinds.Link, resource.Kind);
        Assert.Equal(ResourcePurposes.Practice, resource.Purpose);
        Assert.Equal("Chart PDF", resource.Label);
        Assert.Equal("Guitar", resource.Part);
        Assert.Equal("rehearsal", resource.Note);
        Assert.Equal("https://example.com/chart", resource.Url);
        Assert.Null(resource.ObjectKey);
        Assert.Null(resource.ContentType);
        Assert.Null(resource.ByteSize);
        Assert.Null(resource.OriginalFileName);
        Assert.Equal(Now, resource.CreatedAt);
    }

    [Theory]
    [InlineData(ResourcePurposes.Chart)]
    [InlineData(ResourcePurposes.Lyrics)]
    [InlineData(ResourcePurposes.Audio)]
    [InlineData(ResourcePurposes.Click)]
    [InlineData(ResourcePurposes.Reference)]
    [InlineData(ResourcePurposes.Practice)]
    [InlineData(ResourcePurposes.Other)]
    public void CreateLink_allows_accepted_purposes(string purpose)
    {
        var resource = Resource.CreateLink(ArrangementId, purpose, "Label", "https://x.test", Now);
        Assert.Equal(purpose, resource.Purpose);
    }

    [Fact]
    public void CreateLink_rejects_blank_label_and_url()
    {
        Assert.Throws<ArgumentException>(() =>
            Resource.CreateLink(ArrangementId, ResourcePurposes.Other, "  ", "https://x.test", Now));
        Assert.Throws<ArgumentException>(() =>
            Resource.CreateLink(ArrangementId, ResourcePurposes.Other, "Label", "  ", Now));
    }

    [Fact]
    public void CreateLink_rejects_invalid_purpose()
    {
        Assert.Throws<ArgumentException>(() =>
            Resource.CreateLink(ArrangementId, "stems", "Label", "https://x.test", Now));
    }

    [Fact]
    public void CreateFile_sets_file_fields_and_null_url()
    {
        var resource = Resource.CreateFile(
            ArrangementId,
            ResourcePurposes.Chart,
            "  Chart PDF  ",
            "chart.pdf",
            "application/pdf",
            1024,
            "resources/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            Now,
            part: "  Guitar  ",
            note: "  rehearsal  ");

        Assert.Equal(ResourceKinds.File, resource.Kind);
        Assert.Null(resource.Url);
        Assert.Equal("Chart PDF", resource.Label);
        Assert.Equal("chart.pdf", resource.OriginalFileName);
        Assert.Equal("application/pdf", resource.ContentType);
        Assert.Equal(1024, resource.ByteSize);
        Assert.Equal("resources/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", resource.ObjectKey);
        Assert.Equal("Guitar", resource.Part);
    }

    [Theory]
    [InlineData("image/png")]
    [InlineData("text/plain")]
    [InlineData("audio/mpeg")]
    public void CreateFile_allows_accepted_content_types(string contentType)
    {
        var resource = Resource.CreateFile(
            ArrangementId, ResourcePurposes.Other, "Label", "f.bin", contentType, 10, "key", Now);
        Assert.Equal(contentType, resource.ContentType);
    }

    [Fact]
    public void CreateFile_rejects_disallowed_mime_empty_and_oversize()
    {
        Assert.Throws<ArgumentException>(() =>
            Resource.CreateFile(ArrangementId, ResourcePurposes.Other, "L", "a.exe", "application/octet-stream", 10, "k", Now));
        Assert.Throws<ArgumentException>(() =>
            Resource.CreateFile(ArrangementId, ResourcePurposes.Other, "L", "a.txt", "text/plain", 0, "k", Now));
        Assert.Throws<ArgumentException>(() =>
            Resource.CreateFile(
                ArrangementId, ResourcePurposes.Other, "L", "a.txt", "text/plain",
                ResourceFileConstraints.MaxByteSize + 1, "k", Now));
    }

    [Fact]
    public void UpdateMetadata_allows_file_kind()
    {
        var resource = Resource.CreateFile(
            ArrangementId, ResourcePurposes.Chart, "Old", "a.pdf", "application/pdf", 10, "key", Now);
        resource.UpdateMetadata(ResourcePurposes.Lyrics, "New", null, "note");
        Assert.Equal("New", resource.Label);
        Assert.Equal(ResourcePurposes.Lyrics, resource.Purpose);
        Assert.Equal(ResourceKinds.File, resource.Kind);
        Assert.Equal("application/pdf", resource.ContentType);
    }

    [Fact]
    public void RejectNonLinkKind_rejects_file()
    {
        Assert.Throws<ArgumentException>(() => Resource.RejectNonLinkKind(ResourceKinds.File));
    }

    [Fact]
    public void CreateLink_stores_optional_blank_as_null()
    {
        var resource = Resource.CreateLink(
            ArrangementId, ResourcePurposes.Other, "Label", "https://x.test", Now,
            part: " ", note: "");
        Assert.Null(resource.Part);
        Assert.Null(resource.Note);
    }

    [Fact]
    public void UpdateMetadata_updates_allowed_fields()
    {
        var resource = Resource.CreateLink(
            ArrangementId, ResourcePurposes.Chart, "Old", "https://x.test", Now);
        resource.UpdateMetadata(ResourcePurposes.Lyrics, "New", "Bass", "note");

        Assert.Equal(ResourcePurposes.Lyrics, resource.Purpose);
        Assert.Equal("New", resource.Label);
        Assert.Equal("Bass", resource.Part);
        Assert.Equal("note", resource.Note);
        Assert.Equal("https://x.test", resource.Url);
        Assert.Equal(ResourceKinds.Link, resource.Kind);
    }
}

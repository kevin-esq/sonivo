using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Mvc;
using Sonivo.Migration.Api.Contracts;
using Sonivo.Migration.Api.Contracts.Branding;

namespace Sonivo.Migration.Api.Contracts.Serialization;

/// <summary>
/// System.Text.Json source-generation context. Registering this as the first
/// <c>TypeInfoResolver</c> removes runtime reflection from the request hot path
/// and keeps the API trim/AOT-friendly. No reflection-based serializer fallback
/// is required for the declared contracts.
/// </summary>
[JsonSourceGenerationOptions(
    PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase,
    DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    GenerationMode = JsonSourceGenerationMode.Default)]
[JsonSerializable(typeof(BrandingResponse))]
[JsonSerializable(typeof(BrandingConfig))]
[JsonSerializable(typeof(BrandingLinks))]
[JsonSerializable(typeof(BrandingTexts))]
[JsonSerializable(typeof(BrandingNavTexts))]
[JsonSerializable(typeof(ProblemDetails))]
[JsonSerializable(typeof(HealthResponse))]
public sealed partial class ApiJsonContext : JsonSerializerContext
{
}

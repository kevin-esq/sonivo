namespace Sonivo.Integration.Tests;

[CollectionDefinition(Name, DisableParallelization = true)]
public sealed class PostgresMigrationCollection
{
    public const string Name = "PostgreSQL integration";
}

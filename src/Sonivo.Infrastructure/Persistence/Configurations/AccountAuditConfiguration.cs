using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Sonivo.Domain.Tenancy;

namespace Sonivo.Infrastructure.Persistence.Configurations;

public sealed class AccountAuditConfiguration : IEntityTypeConfiguration<AccountAudit>
{
    public void Configure(EntityTypeBuilder<AccountAudit> builder)
    {
        builder.ToTable("AccountAudit");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Action).IsRequired().HasMaxLength(64);
        builder.HasIndex(x => new { x.TargetUserId, x.CreatedAt });
        builder.HasIndex(x => x.GroupId);
    }
}

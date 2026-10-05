namespace Sonivo.Api.Session;

/// <summary>
/// Stores short-lived session handoff tickets keyed by the SHA-256 hash of the
/// opaque code. <see cref="Consume"/> MUST be atomic (single-use): the first
/// caller removes and receives the ticket; every later caller gets null.
/// </summary>
public interface ISessionHandoffStore
{
    void Store(string codeHash, SessionHandoffTicket ticket);

    SessionHandoffTicket? Consume(string codeHash);
}

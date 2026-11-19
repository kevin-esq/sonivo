internal sealed record RegisterRequest(string? Email, string? Password, string? DisplayName);

internal sealed record LoginRequest(string? Email, string? Password, bool RememberMe = false);
internal sealed record HandleLoginRequest(string? Handle, string? Password, bool RememberMe = false);
internal sealed record ConfirmEmailRequest(string? Email, string? Token);
internal sealed record ResendConfirmationRequest(string? Email);
internal sealed record ForgotPasswordRequest(string? Email);
internal sealed record ResetPasswordRequest(string? Email, string? Token, string? NewPassword);
internal sealed record TestConfirmRequest(string? Email);
internal sealed record TwoFactorCodeRequest(string? Code);
internal sealed record TwoFactorChallengeRequest(string? Code, bool RememberMe = false);
internal sealed record DisableTwoFactorRequest(string? Password);
internal sealed record RegenerateRecoveryCodesRequest(string? Password);
internal sealed record ChangePasswordRequest(string? CurrentPassword, string? NewPassword);
internal sealed record UpdateProfileRequest(string? DisplayName);

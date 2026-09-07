import { signAuthToken } from "@/lib/server/auth";
import { createUserSession } from "@/lib/server/sessions";
import { checkSuspiciousLogin } from "@/lib/server/password-policy";

// Shared by both the normal login success path (auth/login/route.ts) and the post-MFA-
// verification success path (auth/mfa/verify/route.ts) -- both need to end in the exact same
// "create a real session row, sign a token referencing it" sequence, and keeping it in one
// place means the two paths can't silently drift apart (e.g. one forgetting to pass `sid`).
// A separate file rather than adding this to auth.ts or sessions.ts specifically to avoid a
// circular import: auth.ts already imports from sessions.ts (for session validation), so a
// helper needing both signAuthToken and createUserSession has to live somewhere that isn't
// either of those two modules.
export async function issueSessionForUser(
  user: { id: string; email: string; name: string; tenantId: string | null; roleId: string | null },
  opts: { isPlatformAdmin: boolean; platformAdminId: string | null; userAgent: string | null; ipAddress: string | null },
) {
  // Must run before createUserSession below records this login's own IP -- otherwise a
  // brand-new IP would always find "itself" already in history and never look suspicious.
  await checkSuspiciousLogin(user, opts.ipAddress).catch(() => undefined);

  const session = await createUserSession({
    userId: user.id,
    tenantId: user.tenantId,
    userAgent: opts.userAgent,
    ipAddress: opts.ipAddress,
  });

  const accessToken = await signAuthToken(
    {
      sub: user.id,
      email: user.email,
      name: user.name,
      tenantId: user.tenantId,
      roleId: user.roleId,
      isPlatformAdmin: opts.isPlatformAdmin,
      platformAdminId: opts.platformAdminId,
      sid: session.id,
    },
    { expiresIn: session.expiresInSeconds },
  );

  return { accessToken, expiresInSeconds: session.expiresInSeconds };
}

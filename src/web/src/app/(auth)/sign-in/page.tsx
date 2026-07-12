import SignInPageClient from "./sign-in-client"

export default async function SignInPage() {
  // Self-hosted fork: the sign-in form always shows password auth, never
  // the OTP-only branch — self-hosted has no real email delivery, so an
  // OTP-gated prod sign-in is a dead end (see auth.ts's
  // emailAndPassword.enabled comment for the full story). This `isProd`
  // prop is only consumed inside the sign-in form tree; it intentionally
  // does NOT reflect real NODE_ENV/mode here. Other, real isProd gating
  // (auth.ts's plugins array, etc.) is computed independently elsewhere
  // and is untouched by this.
  return <SignInPageClient isProd={false} />
}

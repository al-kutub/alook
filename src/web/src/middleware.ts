import { NextRequest, NextResponse } from "next/server"
import { getCloudflareContext } from "@opennextjs/cloudflare"
import { createAuth } from "@/lib/auth"

function isSafeRedirect(path: string): boolean {
  return path.startsWith("/") && !path.startsWith("//")
}

const AUTH_REQUIRED_PREFIXES = ["/invite/", "/w/", "/workspaces", "/dashboard"]

export async function middleware(request: NextRequest) {
  if (
    request.headers.get("x-forwarded-proto") === "http" &&
    !request.nextUrl.hostname.startsWith("localhost") &&
    !request.nextUrl.hostname.startsWith("127.")
  ) {
    const httpsUrl = request.nextUrl.clone()
    httpsUrl.protocol = "https:"
    return NextResponse.redirect(httpsUrl, 301)
  }

  const { pathname } = request.nextUrl
  const needsAuth = AUTH_REQUIRED_PREFIXES.some((p) => pathname.startsWith(p))

  if (needsAuth) {
    const { env } = await getCloudflareContext({ async: true })
    const auth = createAuth(env as Env)
    const session = await auth.api.getSession({ headers: request.headers })

    if (!session) {
      const signInUrl = new URL("/sign-in", request.url)
      const returnTo = pathname + request.nextUrl.search
      if (returnTo !== "/workspaces") {
        signInUrl.searchParams.set("redirect", returnTo)
      }
      return NextResponse.redirect(signInUrl)
    }
  }

  if (pathname === "/sign-in" || pathname === "/sign-up") {
    const { env } = await getCloudflareContext({ async: true })
    const auth = createAuth(env as Env)
    const session = await auth.api.getSession({ headers: request.headers })

    if (session) {
      const redirect = request.nextUrl.searchParams.get("redirect")
      if (redirect && isSafeRedirect(redirect)) {
        return NextResponse.redirect(new URL(redirect, request.url))
      }
      return NextResponse.redirect(new URL("/workspaces?auto", request.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next|favicon\\.ico|.*\\..*).*)"],
}

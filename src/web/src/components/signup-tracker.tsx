"use client"

import { useEffect } from "react"
import { trackEvent } from "@/lib/analytics"

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : null
}

function deleteCookie(name: string) {
  document.cookie = `${name}=; path=/; max-age=0`
}

export function SignupTracker() {
  useEffect(() => {
    const method = getCookie("is_new_signup")
    if (method) {
      trackEvent("sign_up", { method })
      deleteCookie("is_new_signup")
    }
  }, [])

  return null
}

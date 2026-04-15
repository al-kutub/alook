import { betterAuth } from "better-auth"
import { emailOTP } from "better-auth/plugins"
import { createLogger } from "@alook/shared"
import { getOtpSubject, renderOtpEmail } from "./email-templates"

const isProd = process.env.NODE_ENV === "production"
const log = createLogger({ service: "auth" })

export function createAuth(env: Env) {
  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    database: env.DB,
    secret: env.BETTER_AUTH_SECRET,
    emailAndPassword: {
      enabled: !isProd,
      requireEmailVerification: false,
    },
    socialProviders: {
      github: {
        clientId: env.GITHUB_CLIENT_ID,
        clientSecret: env.GITHUB_CLIENT_SECRET,
      },
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
      },
    },
    plugins: isProd
      ? [
          emailOTP({
            async sendVerificationOTP({ email, otp, type }) {
              log.info("sending OTP email", { to: email, type })
              try {
                await env.SEND_EMAIL.send({
                  from: "no-reply@alook.ai",
                  to: email,
                  subject: getOtpSubject(type),
                  html: renderOtpEmail(otp, type),
                })
                log.info("OTP email sent", { to: email, type })
              } catch (err) {
                log.error("OTP email failed", { to: email, type, err })
                throw err
              }
            },
          }),
        ]
      : [],
  })
}

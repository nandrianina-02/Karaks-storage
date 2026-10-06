import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { createAuthMiddleware, isAPIError } from 'better-auth/api'
import { nextCookies } from 'better-auth/next-js'

import { sendEmail } from '@/lib/email'
import { appUrl, env, isGoogleConfigured } from '@/lib/env'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/services/audit'

/**
 * Authentification du tableau de bord (CDS 17) : email et mot de passe, et
 * connexion Google lorsque les identifiants OAuth sont fournis.
 *
 * Les applications clientes (Karaks, Moziik) ne passent pas par ici : elles
 * s'authentifient par clé API. Ce module ne concerne que les personnes.
 */
export const AUTH_COOKIE_PREFIX = 'karaks-storage'

export const auth = betterAuth({
  appName: 'Karaks Storage',
  baseURL: appUrl,
  // Sous le préfixe de l'API (CDS 18 : /api/v1/auth).
  basePath: '/api/v1/auth',
  secret: env.BETTER_AUTH_SECRET,
  database: prismaAdapter(prisma, { provider: 'postgresql' }),

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    maxPasswordLength: 128,
    sendResetPassword: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: 'Réinitialiser votre mot de passe Karaks Storage',
        text:
          `Bonjour ${user.name},\n\n` +
          `Pour choisir un nouveau mot de passe, ouvrez ce lien dans l'heure :\n${url}\n\n` +
          `Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : votre mot de passe reste inchangé.`,
      })
    },
  },

  socialProviders: isGoogleConfigured
    ? {
        google: {
          clientId: env.GOOGLE_CLIENT_ID!,
          clientSecret: env.GOOGLE_CLIENT_SECRET!,
          // Le jeton Drive est demandé séparément, depuis les réglages : la
          // connexion au tableau de bord ne réclame que l'identité.
          scope: ['openid', 'email', 'profile'],
        },
      }
    : {},

  account: {
    accountLinking: { enabled: true, trustedProviders: ['google'] },
  },

  user: {
    additionalFields: {
      role: { type: 'string', defaultValue: 'USER', input: false },
      status: { type: 'string', defaultValue: 'ACTIVE', input: false },
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 14,
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },

  advanced: {
    cookiePrefix: AUTH_COOKIE_PREFIX,
    useSecureCookies: appUrl.startsWith('https://'),
  },

  rateLimit: {
    enabled: true,
    window: 60,
    max: 60,
    customRules: {
      '/sign-in/email': { window: 60, max: 5 },
      '/sign-up/email': { window: 300, max: 5 },
      '/request-password-reset': { window: 300, max: 3 },
    },
  },

  hooks: {
    // Connexions réussies et échouées au journal (CDS 23).
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== '/sign-in/email' && !ctx.path.startsWith('/callback/')) return
      const request = ctx.request
      const actor = {
        ip: request?.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? null,
        userAgent: request?.headers.get('user-agent') ?? null,
      }
      const session = ctx.context.newSession
      if (session) {
        await audit({ ...actor, userId: session.user.id }, {
          action: 'LOGIN',
          details: { method: ctx.path === '/sign-in/email' ? 'email' : 'google' },
        })
      } else if (isAPIError(ctx.context.returned)) {
        const email = typeof ctx.body?.email === 'string' ? ctx.body.email.toLowerCase() : null
        await audit(actor, { action: 'LOGIN_FAILED', result: 'FAILURE', target: email })
      }
    }),
  },

  onAPIError: { errorURL: '/connexion' },

  plugins: [nextCookies()],
})

export type AuthSession = typeof auth.$Infer.Session

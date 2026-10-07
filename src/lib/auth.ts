import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { createAuthMiddleware, isAPIError } from 'better-auth/api'
import { nextCookies } from 'better-auth/next-js'
import { twoFactor } from 'better-auth/plugins'

import { track } from '@/lib/background'
import { appUrl, env, isGoogleConfigured } from '@/lib/env'
import { prisma } from '@/lib/prisma'
import {
  announceSignUp,
  notifyLoginIfNewDevice,
  notifyPasswordChanged,
  notifyTwoFactorChanged,
  sendPasswordResetEmail,
  sendVerificationEmail,
  sendWelcomeEmail,
} from '@/lib/services/account-emails'
import { audit } from '@/lib/services/audit'

/**
 * Changement de l'état de double authentification, repéré dans la mise à
 * jour du compte : le module l'écrit lui-même, sans route dédiée à
 * l'activation. La clé est le contexte de la requête, propre à chacune.
 */
const twoFactorChanges = new WeakMap<object, boolean>()

/** Une tâche d'arrière-plan qui ne doit jamais faire échouer la requête. */
function background(task: () => Promise<unknown>) {
  track(task().catch((error: unknown) => console.error('[auth]', error instanceof Error ? error.message : error)))
}

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
      await sendPasswordResetEmail(user, url)
    },
    // Un mot de passe réinitialisé ferme toutes les sessions : si c'est un
    // vol, l'intrus perd l'accès en même temps que le mot de passe change.
    revokeSessionsOnPasswordReset: true,
    onPasswordReset: async ({ user }) => {
      notifyPasswordChanged(user.id, 'reset')
    },
  },

  // L'adresse se confirme par un lien, envoyé avec l'accueil. La connexion
  // n'en dépend pas ; une invitation à un projet, si (voir members.ts).
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    expiresIn: 60 * 60,
    sendVerificationEmail: async ({ user, url }) => {
      await sendVerificationEmail(user, url)
    },
  },

  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          // Compte Google : adresse déjà vérifiée, l'accueil seul suffit.
          background(async () => {
            if (user.emailVerified) await sendWelcomeEmail(user)
            await announceSignUp(user, user.emailVerified ? 'google' : 'email')
          })
        },
      },
      update: {
        before: async (data, context) => {
          if (context && typeof data.twoFactorEnabled === 'boolean') twoFactorChanges.set(context, data.twoFactorEnabled)
        },
        after: async (user, context) => {
          const enabled = context ? twoFactorChanges.get(context) : undefined
          if (enabled !== undefined) notifyTwoFactorChanged(user.id, enabled ? 'enabled' : 'disabled')
        },
      },
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
      const succeeded = !isAPIError(ctx.context.returned)
      const sessionUser = ctx.context.session?.user.id
      if (succeeded && sessionUser && ctx.path === '/change-password') notifyPasswordChanged(sessionUser, 'change')
      if (succeeded && sessionUser && ctx.path === '/set-password') notifyPasswordChanged(sessionUser, 'set')
      if (succeeded && sessionUser && ctx.path === '/two-factor/generate-backup-codes') notifyTwoFactorChanged(sessionUser, 'codes')

      // La connexion n'est acquise qu'après le code, quand la double
      // authentification est active : c'est alors la vérification du code
      // qui ouvre la session, et qui est journalisée.
      const watched = ['/sign-in/email', '/two-factor/verify-totp', '/two-factor/verify-backup-code']
      if (!watched.includes(ctx.path) && !ctx.path.startsWith('/callback/')) return
      const request = ctx.request
      const actor = {
        ip: request?.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? null,
        userAgent: request?.headers.get('user-agent') ?? null,
      }
      const session = ctx.context.newSession
      // Confirmer l'activation de la double authentification renouvelle la
      // session d'un compte déjà connecté : ce n'est pas une connexion.
      if (session && ctx.path.startsWith('/two-factor/')) {
        const existing = await ctx.getSignedCookie(ctx.context.authCookies.sessionToken.name, ctx.context.secret)
        if (existing) return
      }
      // Mot de passe vérifié mais code encore attendu : ce n'est pas une
      // connexion. Notre crochet passe avant celui du module de double
      // authentification, qui n'a pas encore remplacé la réponse : seul l'état
      // du compte permet de le savoir (un appareil de confiance n'a pas cette
      // étape, mais sa connexion n'en reste pas moins réelle).
      if (session && ctx.path === '/sign-in/email' && (session.user as { twoFactorEnabled?: boolean }).twoFactorEnabled) {
        const trusted = await ctx.getSignedCookie(ctx.context.createAuthCookie('trust_device').name, ctx.context.secret)
        if (!trusted) return
      }
      if (session) {
        const method = ctx.path.startsWith('/callback/') ? 'google' : 'email'
        const twoFactor = ctx.path.startsWith('/two-factor/')
        await audit({ ...actor, userId: session.user.id }, { action: 'LOGIN', details: { method, twoFactor } })
        background(() => notifyLoginIfNewDevice(session.user.id, { ...actor, method, twoFactor }))
      } else if (isAPIError(ctx.context.returned)) {
        const email = typeof ctx.body?.email === 'string' ? ctx.body.email.toLowerCase() : null
        await audit(actor, { action: 'LOGIN_FAILED', result: 'FAILURE', target: email })
      }
    }),
  },

  onAPIError: { errorURL: '/connexion' },

  plugins: [
    // Double authentification par application (CDS 17) : code à six chiffres,
    // codes de secours, appareil de confiance trente jours.
    twoFactor({ issuer: 'Karaks Storage' }),
    nextCookies(),
  ],
})

export type AuthSession = typeof auth.$Infer.Session

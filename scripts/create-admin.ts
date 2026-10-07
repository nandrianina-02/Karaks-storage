/**
 * Ouvre le compte super administrateur, ou promeut un compte existant.
 *
 * Aucun compte n'est créé automatiquement : un identifiant écrit
 * dans le dépôt serait connu de tous, et faire du premier inscrit un
 * administrateur donnerait le service à qui s'inscrit le premier après la
 * mise en ligne. Ce script fait saisir l'adresse et le
 * mot de passe à la console ; le mot de passe n'est ni affiché ni journalisé,
 * et il est haché par la même fonction qu'à l'inscription.
 *
 * Si l'adresse correspond déjà à un compte (inscription par le site ou par
 * Google), il reçoit le rôle de super administrateur sans que son mot de passe change.
 *
 * Usage : npm run admin:create
 *         npm run admin:create -- --production
 * La base visée est celle de DATABASE_URL ; avec --production, celle de
 * PRODUCTION_DATABASE_URL, lue dans .env sans avoir à la recopier.
 */
import 'dotenv/config'

import { createInterface } from 'node:readline'
import { Writable } from 'node:stream'

import { hashPassword } from 'better-auth/crypto'
import { z } from 'zod'

import type { PrismaClient } from '../src/generated/prisma/client'

// La base est choisie avant de charger le client : il lit DATABASE_URL dès
// son import, d'où l'import dynamique plus bas.
if (process.argv.includes('--production')) {
  if (!process.env.PRODUCTION_DATABASE_URL) {
    console.error('PRODUCTION_DATABASE_URL est vide dans .env.')
    process.exit(1)
  }
  process.env.DATABASE_URL = process.env.PRODUCTION_DATABASE_URL
  process.env.DATABASE_POOL_MAX = '1'
}

let prisma: PrismaClient

const MIN_PASSWORD = 12

/** Sortie qui se tait pendant la saisie du mot de passe. */
const output = new (class extends Writable {
  muted = false
  _write(chunk: Buffer, _encoding: BufferEncoding, done: () => void) {
    if (!this.muted) process.stdout.write(chunk)
    done()
  }
})()

const rl = createInterface({
  input: process.stdin,
  output,
  terminal: Boolean(process.stdin.isTTY),
})

// File de lignes plutôt que `rl.question` : quand les réponses arrivent d'un
// bloc (entrée redirigée), les lignes lues avant la question suivante seraient
// sinon perdues.
const pending: string[] = []
const waiting: Array<(line: string | null) => void> = []
rl.on('line', (line) => {
  const next = waiting.shift()
  if (next) next(line)
  else pending.push(line)
})
rl.on('close', () => {
  for (const next of waiting.splice(0)) next(null)
})

async function ask(question: string, hidden = false): Promise<string> {
  output.muted = false
  process.stdout.write(question)
  output.muted = hidden
  const line =
    pending.shift() ?? (await new Promise<string | null>((resolve) => waiting.push(resolve)))
  output.muted = false
  if (hidden) process.stdout.write('\n')
  if (line === null) throw new Error('Saisie interrompue.')
  return line.trim()
}

async function main() {
  ;({ prisma } = await import('../src/lib/prisma'))
  const host = (() => {
    try {
      return new URL(process.env.DATABASE_URL ?? '').hostname
    } catch {
      return '(DATABASE_URL invalide)'
    }
  })()
  console.log(`Base visée : ${host}\n`)

  const email = z.string().email().safeParse((await ask('Adresse email : ')).toLowerCase())
  if (!email.success) throw new Error('Adresse email invalide.')

  const existing = await prisma.user.findUnique({ where: { email: email.data } })
  if (existing) {
    if (existing.role === 'SUPER_ADMIN') {
      console.log('Ce compte est déjà super administrateur.')
      return
    }
    await prisma.user.update({ where: { id: existing.id }, data: { role: 'SUPER_ADMIN' } })
    console.log(`Compte existant promu super administrateur : ${email.data}`)
    return
  }

  const name = (await ask('Nom affiché : ')) || 'Administration Karaks Storage'
  const password = await ask(`Mot de passe (${MIN_PASSWORD} caractères minimum) : `, true)
  if (password.length < MIN_PASSWORD) {
    throw new Error(`Mot de passe trop court : ${MIN_PASSWORD} caractères minimum.`)
  }
  if ((await ask('Confirmez le mot de passe : ', true)) !== password) {
    throw new Error('Les deux saisies diffèrent.')
  }

  // Même forme que le seed : Better Auth retrouve le mot de passe local par un
  // compte « credential » dont accountId vaut l'identifiant de l'utilisateur.
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { email: email.data, name, emailVerified: true, role: 'SUPER_ADMIN' },
    })
    await tx.account.create({
      data: {
        userId: user.id,
        accountId: user.id,
        providerId: 'credential',
        password: await hashPassword(password),
      },
    })
  })
  console.log(`Super administrateur créé : ${email.data}`)
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(() => {
    rl.close()
    void prisma?.$disconnect()
  })

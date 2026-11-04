import { createHash, randomBytes } from "node:crypto";
import { prisma } from "../../db/prisma.js";
import { BadRequestError, ForbiddenError } from "../../utils/errors.js";
import { SESSION_MAX_AGE_MS } from "./session.js";

const prefix = "desktop-code:";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
export const desktopChallenge = (verifier: string) => createHash("sha256").update(verifier).digest("base64url");

/** A short-lived, single-use code, bound to a verifier held only by the desktop. */
export async function authorizeDesktop(userId: string, challenge: string) {
  const code = randomBytes(32).toString("base64url");
  await prisma.verificationToken.deleteMany({ where: { identifier: { startsWith: prefix }, expires: { lt: new Date() } } });
  await prisma.verificationToken.create({ data: {
    identifier: `${prefix}${challenge}:${userId}`, token: hash(code), expires: new Date(Date.now() + 60_000),
  } });
  return { code };
}

export async function exchangeDesktop(code: string, verifier: string) {
  const token = hash(code);
  const expectedPrefix = `${prefix}${desktopChallenge(verifier)}:`;
  return prisma.$transaction(async tx => {
    const row = await tx.verificationToken.findUnique({ where: { token } });
    if (!row || row.expires <= new Date() || !row.identifier.startsWith(expectedPrefix)) {
      throw new BadRequestError("This desktop sign-in has expired or is invalid. Start again from the desktop app.", "DESKTOP_CODE_INVALID");
    }
    const user = await tx.user.findUnique({ where: { id: row.identifier.slice(expectedPrefix.length) } });
    if (!user || (user.role !== "ADMIN" && !user.emailVerified)) throw new ForbiddenError("Verify your email before connecting the desktop.", "EMAIL_UNVERIFIED");
    // Conditional deletion makes concurrent exchanges single-use too.
    const consumed = await tx.verificationToken.deleteMany({ where: { token, identifier: row.identifier, expires: { gt: new Date() } } });
    if (consumed.count !== 1) throw new BadRequestError("This sign-in has already been used. Start again from the desktop app.", "DESKTOP_CODE_INVALID");
    const session = await tx.session.create({ data: { userId: user.id, sessionToken: randomBytes(32).toString("hex"), expires: new Date(Date.now() + SESSION_MAX_AGE_MS) } });
    return {
      session: { token: session.sessionToken, expiresAt: session.expires.toISOString() },
      user: { id: user.id },
    };
  });
}

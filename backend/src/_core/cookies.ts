import type { CookieOptions, Request } from "express";

export function getSessionCookieOptions(_req?: Request): CookieOptions {
  const isProduction = process.env.NODE_ENV === "production";
  
  // By default:
  // In production direct deployments, default to "lax" for robust CSRF defense.
  // If explicitly configured for cross-site iframe embedding (e.g. preview iframe environments),
  // COOKIE_SAME_SITE="none" can be specified, which mandates secure: true.
  const envSameSite = process.env.COOKIE_SAME_SITE?.toLowerCase();
  const sameSite: "lax" | "strict" | "none" =
    envSameSite === "strict" ? "strict" :
    envSameSite === "none" ? "none" :
    envSameSite === "lax" ? "lax" :
    (isProduction ? "lax" : "none");

  const secure = sameSite === "none" ? true : (isProduction || process.env.COOKIE_SECURE === "true");

  return {
    httpOnly: true,
    path: "/",
    sameSite,
    secure,
  };
}

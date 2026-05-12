import { ADMIN_SESSION_MS, COOKIE_NAME } from "@shared/const";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

export function registerOAuthRoutes(app: Express) {
  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }

    try {
      // Phase 5 hardening: validate state's redirect URI against the request's
      // own host before exchanging code. Mitigates open-redirect / code leak.
      const requestHost = req.get("host");
      if (!requestHost) {
        res.status(400).json({ error: "host header is required" });
        return;
      }
      try {
        sdk.decodeAndValidateState(state, requestHost);
      } catch (err) {
        console.warn("[OAuth] Rejected state for redirect-host mismatch:", err);
        res.status(403).json({ error: "OAuth state validation failed" });
        return;
      }

      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);

      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }

      await db.upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: new Date(),
      });

      // Admin sessions are 8h sliding. Production readiness: an admin laptop
      // left unattended must not stay logged in for a year. Re-auth is cheap;
      // an attacker with a stolen cookie is not.
      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ADMIN_SESSION_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ADMIN_SESSION_MS });

      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}

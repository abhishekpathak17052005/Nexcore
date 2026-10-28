// Platform values are read at use time. See the Webdev service/authentication skills.
export const ENV = {
  get appId() { return process.env.APP_ID ?? process.env.MANUS_PROJECT_ID ?? "nexor-app"; },
  get cookieSecret() {
    return process.env.SESSION_SECRET ?? process.env.MANUS_JWT_SECRET ?? (process.env.NODE_ENV !== "production" ? "nexor-development-session-jwt-secret-min32chars" : "");
  },
  get mongodbUri() { return process.env.MONGODB_URI ?? ""; },
  get mongodbDbName() { return process.env.MONGODB_DB_NAME ?? "consultant_utilization_dashboard"; },
  get oAuthServerUrl() { return process.env.MANUS_OAUTH_API_URL ?? ""; },
  // Preserve the legacy hint when supplied; otherwise roles remain application data.
  get ownerOpenId() { return process.env.OWNER_OPEN_ID ?? ""; },
  get isProduction() { return process.env.NODE_ENV === "production"; },
  get forgeApiUrl() { return process.env.MANUS_API_URL ?? ""; },
  get forgeApiKey() { return process.env.MANUS_API_KEY ?? ""; },
};

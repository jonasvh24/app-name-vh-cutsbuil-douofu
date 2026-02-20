import type { FastifyRequest, FastifyReply } from "fastify";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import * as appSchema from "../db/schema/schema.js";
import * as authSchema from "../db/schema/auth-schema.js";
import type { App } from "../index.js";

const TIKTOK_CLIENT_ID = process.env.TIKTOK_CLIENT_ID || "";
const TIKTOK_CLIENT_SECRET = process.env.TIKTOK_CLIENT_SECRET || "";
const TIKTOK_REDIRECT_URI = process.env.TIKTOK_REDIRECT_URI || "http://localhost:3001/api/social/callback/tiktok";

const YOUTUBE_CLIENT_ID = process.env.YOUTUBE_CLIENT_ID || "";
const YOUTUBE_CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET || "";
const YOUTUBE_REDIRECT_URI = process.env.YOUTUBE_REDIRECT_URI || "http://localhost:3001/api/social/callback/youtube";

const APP_URL = process.env.APP_URL || "http://localhost:3001";

const platformSchema = z.enum(["tiktok", "youtube"]);

export function registerSocialRoutes(app: App) {
  const requireAuth = app.requireAuth();

  // Helper function to validate platform
  function isValidPlatform(platform: string): platform is "tiktok" | "youtube" {
    return platform === "tiktok" || platform === "youtube";
  }

  // GET /api/social/connections
  app.fastify.get(
    "/api/social/connections",
    {
      schema: {
        description: "Get user's social media connections",
        tags: ["social"],
        response: {
          200: {
            type: "array",
            items: {
              type: "object",
              properties: {
                platform: { type: "string", enum: ["tiktok", "youtube"] },
                connected: { type: "boolean" },
              },
            },
          },
          401: {
            type: "object",
            properties: { error: { type: "string" } },
          },
        },
      },
    },
    async (
      request: FastifyRequest,
      reply: FastifyReply
    ): Promise<any[] | void> => {
      const session = await requireAuth(request, reply);
      if (!session) return;

      app.logger.info({ userId: session.user.id }, "Fetching social connections");

      try {
        const connections = await app.db
          .select({
            platform: appSchema.socialConnections.platform,
            connected: appSchema.socialConnections.connected,
          })
          .from(appSchema.socialConnections)
          .where(eq(appSchema.socialConnections.userId, session.user.id));

        // Create a map of connected platforms
        const connectedMap = new Map(
          connections
            .filter((c) => c.connected)
            .map((c) => [c.platform, true])
        );

        // Return both tiktok and youtube, with connected status
        const result = [
          { platform: "tiktok", connected: connectedMap.has("tiktok") || false },
          { platform: "youtube", connected: connectedMap.has("youtube") || false },
        ];

        app.logger.info(
          { userId: session.user.id, connections: result },
          "Social connections fetched"
        );

        return result;
      } catch (error) {
        app.logger.error(
          { err: error, userId: session.user.id },
          "Failed to fetch social connections"
        );
        throw error;
      }
    }
  );

  // POST /api/social/connect/:platform
  app.fastify.post(
    "/api/social/connect/:platform",
    {
      schema: {
        description: "Get OAuth authorization URL for social platform",
        tags: ["social"],
        params: {
          type: "object",
          required: ["platform"],
          properties: {
            platform: { type: "string", enum: ["tiktok", "youtube"] },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              authUrl: { type: "string" },
            },
          },
          400: {
            type: "object",
            properties: { error: { type: "string" } },
          },
          401: {
            type: "object",
            properties: { error: { type: "string" } },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Params: { platform: string } }>,
      reply: FastifyReply
    ): Promise<any | void> => {
      const session = await requireAuth(request, reply);
      if (!session) return;

      const { platform } = request.params;

      app.logger.info(
        { userId: session.user.id, platform },
        "Requesting OAuth authorization URL"
      );

      if (!isValidPlatform(platform)) {
        app.logger.warn({ platform }, "Invalid platform");
        return reply.status(400).send({ error: "Invalid platform. Must be 'tiktok' or 'youtube'" });
      }

      try {
        let authUrl: string;

        if (platform === "tiktok") {
          // For testing, generate a mock OAuth URL even if credentials aren't configured
          const clientId = TIKTOK_CLIENT_ID || "mock_tiktok_client_id";
          const scopes = ["user.info.basic", "video.upload", "video.publish"];
          const state = Buffer.from(JSON.stringify({ userId: session.user.id })).toString("base64");

          authUrl = `https://www.tiktok.com/v1/oauth/authorize?` +
            `client_key=${clientId}&` +
            `response_type=code&` +
            `scope=${scopes.join(",")}&` +
            `redirect_uri=${encodeURIComponent(TIKTOK_REDIRECT_URI)}&` +
            `state=${state}`;
        } else {
          // YouTube
          // For testing, generate a mock OAuth URL even if credentials aren't configured
          const clientId = YOUTUBE_CLIENT_ID || "mock_youtube_client_id";
          const scopes = [
            "https://www.googleapis.com/auth/youtube.upload",
            "https://www.googleapis.com/auth/youtube",
          ];
          const state = Buffer.from(JSON.stringify({ userId: session.user.id })).toString("base64");

          authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
            `client_id=${clientId}&` +
            `response_type=code&` +
            `scope=${scopes.join(" ")}&` +
            `redirect_uri=${encodeURIComponent(YOUTUBE_REDIRECT_URI)}&` +
            `state=${state}&` +
            `access_type=offline&` +
            `prompt=consent`;
        }

        app.logger.info(
          { userId: session.user.id, platform },
          "OAuth authorization URL generated"
        );

        return { authUrl };
      } catch (error) {
        app.logger.error(
          { err: error, userId: session.user.id, platform },
          "Failed to generate OAuth URL"
        );
        throw error;
      }
    }
  );

  // GET /api/social/callback/:platform
  app.fastify.get(
    "/api/social/callback/:platform",
    {
      schema: {
        description: "OAuth callback handler for social platforms",
        tags: ["social"],
        params: {
          type: "object",
          required: ["platform"],
          properties: {
            platform: { type: "string", enum: ["tiktok", "youtube"] },
          },
        },
        querystring: {
          type: "object",
          properties: {
            code: { type: "string" },
            state: { type: "string" },
            error: { type: "string" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              message: { type: "string" },
            },
          },
          400: {
            type: "object",
            properties: { error: { type: "string" } },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Params: { platform: string };
        Querystring: { code?: string; state?: string; error?: string };
      }>,
      reply: FastifyReply
    ): Promise<any | void> => {
      const { platform } = request.params;
      const { code, state, error: oauthError } = request.query;

      app.logger.info({ platform, code: code?.substring(0, 10) }, "OAuth callback received");

      if (!isValidPlatform(platform)) {
        app.logger.warn({ platform }, "Invalid platform in callback");
        return reply.status(400).send({ error: "Invalid platform" });
      }

      if (oauthError) {
        app.logger.warn({ platform, error: oauthError }, "OAuth error");
        return reply.status(400).send({ error: `OAuth error: ${oauthError}` });
      }

      if (!code) {
        app.logger.warn({ platform }, "No authorization code in callback");
        return reply.status(400).send({ error: "No authorization code provided" });
      }

      if (!state) {
        app.logger.warn({ platform }, "No state in callback");
        return reply.status(400).send({ error: "Invalid state" });
      }

      try {
        // Decode state to get userId
        const stateData = JSON.parse(Buffer.from(state, "base64").toString());
        const userId = stateData.userId;

        if (!userId) {
          app.logger.warn({ state }, "No userId in state");
          return reply.status(400).send({ error: "Invalid state data" });
        }

        app.logger.info({ userId, platform, code: code.substring(0, 10) }, "Processing OAuth callback");

        // For testing/demo purposes, create a mock connection
        // In production, you would exchange the code for an access token here
        const platformUserId = `${platform}_user_${Date.now()}`;
        const platformUsername = `${platform}_user_${Date.now()}`;

        // Check if connection already exists
        const existing = await app.db
          .select()
          .from(appSchema.socialConnections)
          .where(
            and(
              eq(appSchema.socialConnections.userId, userId),
              eq(appSchema.socialConnections.platform, platform)
            )
          );

        if (existing.length > 0) {
          // Update existing connection
          await app.db
            .update(appSchema.socialConnections)
            .set({
              connected: true,
              platformUserId,
              platformUsername,
              accessToken: `token_${Date.now()}`,
              refreshToken: `refresh_${Date.now()}`,
              tokenExpiresAt: new Date(Date.now() + 3600000), // 1 hour from now
            })
            .where(
              and(
                eq(appSchema.socialConnections.userId, userId),
                eq(appSchema.socialConnections.platform, platform)
              )
            );

          app.logger.info(
            { userId, platform },
            "Social connection updated"
          );
        } else {
          // Create new connection
          await app.db.insert(appSchema.socialConnections).values({
            userId,
            platform,
            connected: true,
            platformUserId,
            platformUsername,
            accessToken: `token_${Date.now()}`,
            refreshToken: `refresh_${Date.now()}`,
            tokenExpiresAt: new Date(Date.now() + 3600000), // 1 hour from now
          });

          app.logger.info(
            { userId, platform },
            "Social connection created"
          );
        }

        // Redirect to success page or return success
        return {
          success: true,
          message: `Successfully connected ${platform} account`,
        };
      } catch (error) {
        app.logger.error(
          { err: error, platform, userId: request.query.state },
          "Failed to process OAuth callback"
        );
        return reply.status(500).send({ error: "Failed to process callback" });
      }
    }
  );

  // DELETE /api/social/disconnect/:platform
  app.fastify.delete(
    "/api/social/disconnect/:platform",
    {
      schema: {
        description: "Disconnect a social media account",
        tags: ["social"],
        params: {
          type: "object",
          required: ["platform"],
          properties: {
            platform: { type: "string", enum: ["tiktok", "youtube"] },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              message: { type: "string" },
            },
          },
          400: {
            type: "object",
            properties: { error: { type: "string" } },
          },
          401: {
            type: "object",
            properties: { error: { type: "string" } },
          },
          404: {
            type: "object",
            properties: { error: { type: "string" } },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Params: { platform: string } }>,
      reply: FastifyReply
    ): Promise<any | void> => {
      const session = await requireAuth(request, reply);
      if (!session) return;

      const { platform } = request.params;

      app.logger.info(
        { userId: session.user.id, platform },
        "Disconnecting social account"
      );

      if (!isValidPlatform(platform)) {
        app.logger.warn({ platform }, "Invalid platform");
        return reply.status(400).send({ error: "Invalid platform. Must be 'tiktok' or 'youtube'" });
      }

      try {
        // Check if connection exists and belongs to user
        const connection = await app.db
          .select()
          .from(appSchema.socialConnections)
          .where(
            and(
              eq(appSchema.socialConnections.userId, session.user.id),
              eq(appSchema.socialConnections.platform, platform)
            )
          );

        if (!connection.length || !connection[0].connected) {
          app.logger.warn(
            { userId: session.user.id, platform },
            "Social connection not found or not connected"
          );
          return reply.status(404).send({
            success: false,
            error: `No active ${platform} connection found`,
          });
        }

        // Mark as disconnected (soft delete)
        await app.db
          .update(appSchema.socialConnections)
          .set({ connected: false })
          .where(
            and(
              eq(appSchema.socialConnections.userId, session.user.id),
              eq(appSchema.socialConnections.platform, platform)
            )
          );

        app.logger.info(
          { userId: session.user.id, platform },
          "Social connection disconnected"
        );

        return {
          success: true,
          message: `${platform} account disconnected successfully`,
        };
      } catch (error) {
        app.logger.error(
          { err: error, userId: session.user.id, platform },
          "Failed to disconnect social account"
        );
        throw error;
      }
    }
  );
}

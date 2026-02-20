import type { FastifyRequest, FastifyReply } from "fastify";
import { eq } from "drizzle-orm";
import { z } from "zod";
import * as appSchema from "../db/schema/schema.js";
import type { App } from "../index.js";

// Mock music database - in production, this would be a real service
const mockMusicLibrary = [
  {
    id: "music_1",
    title: "Uplifting Cinematic",
    artist: "Various",
    duration: 180,
    genre: "Cinematic",
    url: "https://example.com/music/uplifting-cinematic.mp3",
  },
  {
    id: "music_2",
    title: "Energetic Pop",
    artist: "Various",
    duration: 240,
    genre: "Pop",
    url: "https://example.com/music/energetic-pop.mp3",
  },
  {
    id: "music_3",
    title: "Chill Lo-fi",
    artist: "Various",
    duration: 200,
    genre: "Lo-fi",
    url: "https://example.com/music/chill-lofi.mp3",
  },
  {
    id: "music_4",
    title: "Epic Action",
    artist: "Various",
    duration: 220,
    genre: "Action",
    url: "https://example.com/music/epic-action.mp3",
  },
];

const searchMusicSchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().positive().default(10).optional(),
});

const importMusicSchema = z.object({
  title: z.string().min(1),
  artist: z.string().min(1),
  duration: z.number().int().positive(),
  genre: z.string().min(1),
});

const attachMusicSchema = z.object({
  projectId: z.string().uuid(),
  musicUrl: z.string().url(),
});

export function registerMusicRoutes(app: App) {
  const requireAuth = app.requireAuth();

  // GET /api/music/search
  app.fastify.get(
    "/api/music/search",
    {
      schema: {
        description: "Search for music tracks",
        tags: ["music"],
        querystring: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search query" },
            limit: { type: "number", default: 10 },
          },
          required: ["query"],
        },
        response: {
          200: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                title: { type: "string" },
                artist: { type: "string" },
                duration: { type: "number" },
                genre: { type: "string" },
                url: { type: "string" },
              },
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
      request: FastifyRequest<{
        Querystring: { query: string; limit?: number };
      }>,
      reply: FastifyReply
    ): Promise<any[] | void> => {
      const session = await requireAuth(request, reply);
      if (!session) return;

      const { query, limit = 10 } = request.query;

      app.logger.info({ userId: session.user.id, query }, "Searching music");

      const validation = searchMusicSchema.safeParse({ query, limit });
      if (!validation.success) {
        app.logger.warn({ errors: validation.error }, "Invalid search query");
        return reply.status(400).send({ error: "Invalid search parameters" });
      }

      try {
        // Search in mock library
        const results = mockMusicLibrary
          .filter(
            (track) =>
              track.title.toLowerCase().includes(query.toLowerCase()) ||
              track.artist.toLowerCase().includes(query.toLowerCase()) ||
              track.genre.toLowerCase().includes(query.toLowerCase())
          )
          .slice(0, limit);

        app.logger.info(
          { userId: session.user.id, query, resultCount: results.length },
          "Music search completed"
        );

        return results;
      } catch (error) {
        app.logger.error(
          { err: error, userId: session.user.id, query },
          "Failed to search music"
        );
        throw error;
      }
    }
  );

  // POST /api/music/import
  app.fastify.post(
    "/api/music/import",
    {
      schema: {
        description: "Import/upload a music file",
        tags: ["music"],
        body: {
          type: "object",
          required: ["title", "artist", "duration", "genre"],
          properties: {
            title: { type: "string" },
            artist: { type: "string" },
            duration: { type: "number" },
            genre: { type: "string" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              id: { type: "string" },
              title: { type: "string" },
              artist: { type: "string" },
              duration: { type: "number" },
              genre: { type: "string" },
              url: { type: "string" },
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
      request: FastifyRequest<{
        Body: { title: string; artist: string; duration: number; genre: string };
      }>,
      reply: FastifyReply
    ): Promise<any | void> => {
      const session = await requireAuth(request, reply);
      if (!session) return;

      app.logger.info({ userId: session.user.id, body: request.body }, "Importing music");

      const validation = importMusicSchema.safeParse(request.body);
      if (!validation.success) {
        app.logger.warn({ errors: validation.error }, "Invalid music data");
        return reply.status(400).send({ error: "Invalid music metadata" });
      }

      try {
        // Generate music ID and upload URL
        const musicId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const key = `uploads/${session.user.id}/music/${musicId}`;

        // For JSON-based import, just generate a mock URL
        const url = `https://storage.example.com/${key}`;

        const music = {
          id: musicId,
          title: validation.data.title,
          artist: validation.data.artist,
          duration: validation.data.duration,
          genre: validation.data.genre,
          url,
        };

        app.logger.info(
          { userId: session.user.id, musicId, title: music.title },
          "Music imported successfully"
        );

        return music;
      } catch (error) {
        app.logger.error(
          { err: error, userId: session.user.id },
          "Failed to import music"
        );
        throw error;
      }
    }
  );

  // POST /api/music/attach-to-project
  app.fastify.post(
    "/api/music/attach-to-project",
    {
      schema: {
        description: "Attach a music track to a video project",
        tags: ["music"],
        body: {
          type: "object",
          required: ["projectId", "musicUrl"],
          properties: {
            projectId: { type: "string", format: "uuid" },
            musicUrl: { type: "string" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              projectId: { type: "string" },
              musicUrl: { type: "string" },
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
          403: {
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
      request: FastifyRequest<{
        Body: { projectId: string; musicUrl: string };
      }>,
      reply: FastifyReply
    ): Promise<any | void> => {
      const session = await requireAuth(request, reply);
      if (!session) return;

      const { projectId, musicUrl } = request.body;

      app.logger.info(
        { userId: session.user.id, projectId },
        "Attaching music to project"
      );

      const validation = attachMusicSchema.safeParse(request.body);
      if (!validation.success) {
        app.logger.warn({ errors: validation.error }, "Invalid request body");
        return reply.status(400).send({ error: "Invalid request" });
      }

      try {
        // Verify project exists and belongs to user
        const project = await app.db
          .select()
          .from(appSchema.videoProjects)
          .where(eq(appSchema.videoProjects.id, projectId));

        if (!project.length) {
          app.logger.warn({ projectId }, "Project not found");
          return reply.status(404).send({ error: "Project not found" });
        }

        if (project[0].userId !== session.user.id) {
          app.logger.warn({ projectId, userId: session.user.id }, "Unauthorized");
          return reply.status(403).send({ error: "Unauthorized" });
        }

        // Update project with music URL
        const [updated] = await app.db
          .update(appSchema.videoProjects)
          .set({ musicUrl: validation.data.musicUrl })
          .where(eq(appSchema.videoProjects.id, projectId))
          .returning();

        app.logger.info(
          { projectId, musicUrl },
          "Music attached to project successfully"
        );

        return {
          success: true,
          projectId: updated.id,
          musicUrl: updated.musicUrl,
        };
      } catch (error) {
        app.logger.error(
          { err: error, projectId, userId: session.user.id },
          "Failed to attach music"
        );
        throw error;
      }
    }
  );
}

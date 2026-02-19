import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema/schema.js";
import * as authSchema from "../db/schema/auth-schema.js";
import type { App } from "../index.js";
import { gateway } from "@specific-dev/framework";
import { generateText, generateObject } from "ai";
import { z } from "zod";

const createProjectSchema = z.object({
  videoUrl: z.string().url(),
  prompt: z.string().min(1),
});

const regenerateProjectSchema = z.object({
  prompt: z.string().min(1),
});

const publishProjectSchema = z.object({
  platforms: z.array(z.enum(["tiktok", "youtube"])).min(1),
});

const videoMetadataSchema = z.object({
  title: z.string(),
  description: z.string(),
  hashtags: z.array(z.string()),
  hook: z.string(),
});

type VideoMetadata = z.infer<typeof videoMetadataSchema>;

async function generateVideoMetadata(
  prompt: string,
  editingSummary: string
): Promise<VideoMetadata> {
  const { object } = await generateObject({
    model: gateway("google/gemini-2.5-flash"),
    schema: videoMetadataSchema,
    schemaName: "VideoMetadata",
    schemaDescription:
      "Generate optimized metadata for a video including title, description, hashtags and hook",
    prompt: `You are a TikTok/YouTube Shorts expert. Based on the following video editing prompt and summary of edits made, generate optimized metadata for maximum engagement:

Editing Prompt: "${prompt}"
Editing Summary: "${editingSummary}"

Generate a catchy title (max 100 chars), engaging description (max 300 chars), relevant hashtags (5-10), and a short hook sentence (max 30 chars) to grab attention.`,
  });

  return object;
}

async function generateEditingInstructions(prompt: string): Promise<string> {
  const { text } = await generateText({
    model: gateway("google/gemini-2.5-flash"),
    system: `You are an expert video editor. Analyze video editing requests and provide clear, actionable editing instructions.

Return a JSON object with the structure:
{
  "cuts": ["timestamp ranges to remove or keep"],
  "transitions": ["transition types and positions"],
  "effects": ["visual effects to apply"],
  "captions": true/false,
  "colorGrading": "color grade description",
  "music": "background music style",
  "pacing": "fast/medium/slow",
  "format": "9:16 for vertical"
}`,
    prompt: `Generate detailed editing instructions for this video editing request: "${prompt}"`,
  });

  return text;
}

export function registerVideoRoutes(app: App) {
  const requireAuth = app.requireAuth();

  // POST /api/upload/video
  app.fastify.post(
    "/api/upload/video",
    {
      schema: {
        description: "Upload a video file to storage",
        tags: ["videos"],
        response: {
          200: {
            type: "object",
            properties: {
              videoUrl: { type: "string" },
              videoId: { type: "string" },
            },
          },
          400: {
            type: "object",
            properties: { error: { type: "string" } },
          },
          413: {
            type: "object",
            properties: { error: { type: "string" } },
          },
        },
      },
    },
    async (
      request: FastifyRequest,
      reply: FastifyReply
    ): Promise<{ videoUrl: string; videoId: string } | void> => {
      app.logger.info("Starting video upload");

      const session = await requireAuth(request, reply);
      if (!session) return;

      const data = await request.file({
        limits: { fileSize: 500 * 1024 * 1024 },
      }); // 500MB limit
      if (!data) {
        app.logger.warn("No video file provided");
        return reply.status(400).send({ error: "No video file provided" });
      }

      let buffer: Buffer;
      try {
        buffer = await data.toBuffer();
      } catch (err) {
        app.logger.error({ err }, "Video file too large");
        return reply.status(413).send({ error: "File too large" });
      }

      const videoId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const key = `uploads/${session.user.id}/videos/${videoId}`;

      try {
        const uploadedKey = await app.storage.upload(key, buffer);
        const { url } = await app.storage.getSignedUrl(uploadedKey);

        app.logger.info({ videoId, userId: session.user.id }, "Video uploaded successfully");
        return { videoUrl: url, videoId };
      } catch (error) {
        app.logger.error({ err: error, videoId }, "Failed to upload video");
        throw error;
      }
    }
  );

  // POST /api/projects
  app.fastify.post(
    "/api/projects",
    {
      schema: {
        description: "Create a new video project and start AI editing process",
        tags: ["projects"],
        body: {
          type: "object",
          required: ["videoUrl", "prompt"],
          properties: {
            videoUrl: { type: "string" },
            prompt: { type: "string" },
          },
        },
        response: {
          201: {
            type: "object",
            properties: {
              projectId: { type: "string" },
              status: { type: "string" },
            },
          },
          400: {
            type: "object",
            properties: {
              error: { type: "string" },
              message: { type: "string" },
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
      request: FastifyRequest<{
        Body: { videoUrl: string; prompt: string };
      }>,
      reply: FastifyReply
    ): Promise<{ projectId: string; status: string } | void> => {
      app.logger.info({ body: request.body }, "Creating video project");

      const session = await requireAuth(request, reply);
      if (!session) return;

      const validation = createProjectSchema.safeParse(request.body);
      if (!validation.success) {
        app.logger.warn({ errors: validation.error }, "Invalid request body");
        return reply.status(400).send({ error: "Invalid request body" });
      }

      const { videoUrl, prompt } = validation.data;

      try {
        // Check credits before creating project
        const user = await app.db
          .select({
            credits: authSchema.user.credits,
            subscriptionStatus: authSchema.user.subscriptionStatus,
            subscriptionEndDate: authSchema.user.subscriptionEndDate,
          })
          .from(authSchema.user)
          .where(eq(authSchema.user.id, session.user.id));

        if (!user.length) {
          app.logger.warn({ userId: session.user.id }, "User not found");
          return reply.status(404).send({ error: "User not found" });
        }

        // Check if user has active subscription
        const hasActiveSubscription =
          (user[0].subscriptionStatus === "monthly" || user[0].subscriptionStatus === "yearly") &&
          user[0].subscriptionEndDate &&
          new Date(user[0].subscriptionEndDate) > new Date();

        // If free user, check if credits > 0
        if (!hasActiveSubscription && (user[0].credits || 0) <= 0) {
          app.logger.warn(
            { userId: session.user.id, credits: user[0].credits },
            "Insufficient credits for video edit"
          );
          return reply.status(400).send({
            error: "insufficient_credits",
            message: "You need more credits",
          });
        }

        const [project] = await app.db
          .insert(schema.videoProjects)
          .values({
            userId: session.user.id,
            originalVideoUrl: videoUrl,
            prompt,
            status: "processing",
          })
          .returning();

        app.logger.info(
          { projectId: project.id, userId: session.user.id },
          "Video project created"
        );

        // Deduct credit if not subscribed
        if (!hasActiveSubscription) {
          const newCredits = (user[0].credits || 0) - 1;
          await app.db
            .update(authSchema.user)
            .set({ credits: newCredits })
            .where(eq(authSchema.user.id, session.user.id));

          // Create transaction record
          await app.db.insert(schema.creditTransactions).values({
            userId: session.user.id,
            amount: -1,
            transactionType: "edit_used",
            description: `Credit deducted for video edit (project ${project.id})`,
          });

          app.logger.info(
            { userId: session.user.id, remainingCredits: newCredits },
            "Credit deducted for video edit"
          );
        }

        // Start background processing
        processVideoInBackground(app, project.id, prompt).catch((err) => {
          app.logger.error(
            { err, projectId: project.id },
            "Background video processing failed"
          );
        });

        return reply.status(201).send({
          projectId: project.id,
          status: "processing",
        });
      } catch (error) {
        app.logger.error({ err: error, body: request.body }, "Failed to create project");
        throw error;
      }
    }
  );

  // GET /api/projects
  app.fastify.get(
    "/api/projects",
    {
      schema: {
        description: "Get all video projects for the authenticated user",
        tags: ["projects"],
        response: {
          200: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                originalVideoUrl: { type: "string" },
                editedVideoUrl: { type: ["string", "null"] },
                prompt: { type: "string" },
                status: { type: "string" },
                title: { type: ["string", "null"] },
                description: { type: ["string", "null"] },
                hashtags: { type: ["string", "null"] },
                thumbnailUrl: { type: ["string", "null"] },
                createdAt: { type: "string", format: "date-time" },
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

      app.logger.info({ userId: session.user.id }, "Fetching user projects");

      try {
        const projects = await app.db
          .select()
          .from(schema.videoProjects)
          .where(eq(schema.videoProjects.userId, session.user.id));

        app.logger.info(
          { userId: session.user.id, count: projects.length },
          "Projects fetched successfully"
        );

        return projects;
      } catch (error) {
        app.logger.error({ err: error, userId: session.user.id }, "Failed to fetch projects");
        throw error;
      }
    }
  );

  // GET /api/projects/:id
  app.fastify.get(
    "/api/projects/:id",
    {
      schema: {
        description: "Get a specific video project by ID",
        tags: ["projects"],
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "string", format: "uuid" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              id: { type: "string" },
              originalVideoUrl: { type: "string" },
              editedVideoUrl: { type: ["string", "null"] },
              prompt: { type: "string" },
              status: { type: "string" },
              title: { type: ["string", "null"] },
              description: { type: ["string", "null"] },
              hashtags: { type: ["string", "null"] },
              thumbnailUrl: { type: ["string", "null"] },
              createdAt: { type: "string", format: "date-time" },
            },
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
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ): Promise<any | void> => {
      const session = await requireAuth(request, reply);
      if (!session) return;

      const { id } = request.params;
      app.logger.info({ projectId: id, userId: session.user.id }, "Fetching project details");

      try {
        const project = await app.db
          .select()
          .from(schema.videoProjects)
          .where(eq(schema.videoProjects.id, id));

        if (!project.length) {
          app.logger.warn({ projectId: id }, "Project not found");
          return reply.status(404).send({ error: "Project not found" });
        }

        if (project[0].userId !== session.user.id) {
          app.logger.warn(
            { projectId: id, userId: session.user.id },
            "Unauthorized project access"
          );
          return reply.status(403).send({ error: "Unauthorized" });
        }

        app.logger.info({ projectId: id }, "Project details fetched successfully");
        return project[0];
      } catch (error) {
        app.logger.error({ err: error, projectId: id }, "Failed to fetch project");
        throw error;
      }
    }
  );

  // POST /api/projects/:id/regenerate
  app.fastify.post(
    "/api/projects/:id/regenerate",
    {
      schema: {
        description: "Regenerate a video edit with a new prompt",
        tags: ["projects"],
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "string", format: "uuid" },
          },
        },
        body: {
          type: "object",
          required: ["prompt"],
          properties: {
            prompt: { type: "string" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              id: { type: "string" },
              status: { type: "string" },
              prompt: { type: "string" },
            },
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
        Params: { id: string };
        Body: { prompt: string };
      }>,
      reply: FastifyReply
    ): Promise<any | void> => {
      const session = await requireAuth(request, reply);
      if (!session) return;

      const { id } = request.params;
      app.logger.info(
        { projectId: id, userId: session.user.id, body: request.body },
        "Regenerating project"
      );

      const validation = regenerateProjectSchema.safeParse(request.body);
      if (!validation.success) {
        app.logger.warn({ errors: validation.error }, "Invalid request body");
        return reply.status(400).send({ error: "Invalid request body" });
      }

      try {
        const project = await app.db
          .select()
          .from(schema.videoProjects)
          .where(eq(schema.videoProjects.id, id));

        if (!project.length) {
          app.logger.warn({ projectId: id }, "Project not found");
          return reply.status(404).send({ error: "Project not found" });
        }

        if (project[0].userId !== session.user.id) {
          app.logger.warn({ projectId: id, userId: session.user.id }, "Unauthorized access");
          return reply.status(403).send({ error: "Unauthorized" });
        }

        const [updated] = await app.db
          .update(schema.videoProjects)
          .set({
            prompt: validation.data.prompt,
            status: "processing",
            editedVideoUrl: null,
            title: null,
            description: null,
            hashtags: null,
            thumbnailUrl: null,
          })
          .where(eq(schema.videoProjects.id, id))
          .returning();

        app.logger.info(
          { projectId: id, prompt: validation.data.prompt },
          "Project regeneration started"
        );

        // Start background processing
        processVideoInBackground(app, id, validation.data.prompt).catch((err) => {
          app.logger.error(
            { err, projectId: id },
            "Background video regeneration failed"
          );
        });

        return {
          id: updated.id,
          status: updated.status,
          prompt: updated.prompt,
        };
      } catch (error) {
        app.logger.error({ err: error, projectId: id }, "Failed to regenerate project");
        throw error;
      }
    }
  );

  // POST /api/projects/:id/publish
  app.fastify.post(
    "/api/projects/:id/publish",
    {
      schema: {
        description: "Publish an edited video to selected platforms",
        tags: ["projects"],
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "string", format: "uuid" },
          },
        },
        body: {
          type: "object",
          required: ["platforms"],
          properties: {
            platforms: {
              type: "array",
              items: { type: "string", enum: ["tiktok", "youtube"] },
              minItems: 1,
            },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              publishedTo: { type: "array", items: { type: "string" } },
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
        Params: { id: string };
        Body: { platforms: string[] };
      }>,
      reply: FastifyReply
    ): Promise<{ success: boolean; publishedTo: string[] } | void> => {
      const session = await requireAuth(request, reply);
      if (!session) return;

      const { id } = request.params;
      app.logger.info(
        { projectId: id, userId: session.user.id, platforms: request.body.platforms },
        "Publishing video"
      );

      const validation = publishProjectSchema.safeParse(request.body);
      if (!validation.success) {
        app.logger.warn({ errors: validation.error }, "Invalid request body");
        return reply.status(400).send({ error: "Invalid request body" });
      }

      try {
        const project = await app.db
          .select()
          .from(schema.videoProjects)
          .where(eq(schema.videoProjects.id, id));

        if (!project.length) {
          app.logger.warn({ projectId: id }, "Project not found");
          return reply.status(404).send({ error: "Project not found" });
        }

        if (project[0].userId !== session.user.id) {
          app.logger.warn({ projectId: id, userId: session.user.id }, "Unauthorized access");
          return reply.status(403).send({ error: "Unauthorized" });
        }

        // In a real implementation, this would integrate with TikTok and YouTube APIs
        // For now, we just return success
        const publishedTo = validation.data.platforms;

        app.logger.info(
          { projectId: id, publishedTo },
          "Video published successfully"
        );

        return { success: true, publishedTo };
      } catch (error) {
        app.logger.error({ err: error, projectId: id }, "Failed to publish video");
        throw error;
      }
    }
  );
}

async function processVideoInBackground(
  app: App,
  projectId: string,
  prompt: string
): Promise<void> {
  try {
    app.logger.info({ projectId }, "Starting background video processing");

    // Generate editing instructions
    const editingInstructions = await generateEditingInstructions(prompt);
    app.logger.info({ projectId, instructions: editingInstructions }, "Editing instructions generated");

    // In a real implementation, we would:
    // 1. Download the original video
    // 2. Apply the editing transformations (using FFmpeg or similar)
    // 3. Upload the edited video to storage
    // For this demo, we'll simulate completion with metadata generation

    // Generate video metadata
    const metadata = await generateVideoMetadata(
      prompt,
      editingInstructions
    );

    app.logger.info({ projectId, metadata }, "Video metadata generated");

    // Generate a mock edited video URL (in production, this would be the actual edited video URL)
    const mockEditedVideoUrl = `https://example.com/edited-videos/${projectId}-edited.mp4`;
    const mockThumbnailUrl = `https://example.com/thumbnails/${projectId}-thumb.jpg`;

    // Update project with results
    await app.db
      .update(schema.videoProjects)
      .set({
        status: "completed",
        editedVideoUrl: mockEditedVideoUrl,
        title: metadata.title,
        description: metadata.description,
        hashtags: metadata.hashtags.join(" "),
        thumbnailUrl: mockThumbnailUrl,
      })
      .where(eq(schema.videoProjects.id, projectId));

    app.logger.info({ projectId, status: "completed" }, "Video processing completed");
  } catch (error) {
    app.logger.error({ err: error, projectId }, "Video processing failed");

    // Update project with error status
    await app.db
      .update(schema.videoProjects)
      .set({ status: "failed" })
      .where(eq(schema.videoProjects.id, projectId));
  }
}

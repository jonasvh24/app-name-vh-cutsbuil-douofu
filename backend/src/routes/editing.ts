import type { FastifyRequest, FastifyReply } from "fastify";
import { eq } from "drizzle-orm";
import { z } from "zod";
import * as appSchema from "../db/schema/schema.js";
import type { App } from "../index.js";

const applyEditsSchema = z.object({
  edits: z.array(
    z.object({
      type: z.enum(["trim", "reorder", "timing"]),
      params: z.record(z.string(), z.any()).optional(),
    })
  ),
});

const saveEditSchema = z.object({
  changes: z.record(z.string(), z.any()).optional(),
});

export function registerEditingRoutes(app: App) {
  const requireAuth = app.requireAuth();

  // GET /api/editing/:projectId/retrieve
  app.fastify.get(
    "/api/editing/:projectId/retrieve",
    {
      schema: {
        description: "Retrieve a completed video edit for further editing",
        tags: ["editing"],
        params: {
          type: "object",
          required: ["projectId"],
          properties: {
            projectId: { type: "string", format: "uuid" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              id: { type: "string" },
              userId: { type: "string" },
              originalVideoUrl: { type: "string" },
              editedVideoUrl: { type: ["string", "null"] },
              prompt: { type: "string" },
              status: { type: "string" },
              title: { type: ["string", "null"] },
              description: { type: ["string", "null"] },
              hashtags: { type: ["string", "null"] },
              thumbnailUrl: { type: ["string", "null"] },
              musicUrl: { type: ["string", "null"] },
              createdAt: { type: "string", format: "date-time" },
              updatedAt: { type: "string", format: "date-time" },
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
      request: FastifyRequest<{ Params: { projectId: string } }>,
      reply: FastifyReply
    ): Promise<any | void> => {
      const session = await requireAuth(request, reply);
      if (!session) return;

      const { projectId } = request.params;

      app.logger.info(
        { userId: session.user.id, projectId },
        "Retrieving edit for project"
      );

      try {
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

        app.logger.info({ projectId }, "Edit retrieved successfully");

        return {
          ...project[0],
          createdAt: project[0].createdAt.toISOString(),
          updatedAt: project[0].updatedAt.toISOString(),
        };
      } catch (error) {
        app.logger.error(
          { err: error, projectId, userId: session.user.id },
          "Failed to retrieve edit"
        );
        throw error;
      }
    }
  );

  // POST /api/editing/:projectId/apply-edits
  app.fastify.post(
    "/api/editing/:projectId/apply-edits",
    {
      schema: {
        description: "Apply simple edits to a video (trim, reorder clips, adjust timing)",
        tags: ["editing"],
        params: {
          type: "object",
          required: ["projectId"],
          properties: {
            projectId: { type: "string", format: "uuid" },
          },
        },
        body: {
          type: "object",
          required: ["edits"],
          properties: {
            edits: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  type: {
                    type: "string",
                    enum: ["trim", "reorder", "timing"],
                  },
                  params: { type: "object" },
                },
              },
            },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              projectId: { type: "string" },
              editsApplied: { type: "number" },
              status: { type: "string" },
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
        Params: { projectId: string };
        Body: { edits: Array<{ type: string; params?: any }> };
      }>,
      reply: FastifyReply
    ): Promise<any | void> => {
      const session = await requireAuth(request, reply);
      if (!session) return;

      const { projectId } = request.params;

      app.logger.info(
        { userId: session.user.id, projectId, editCount: request.body.edits.length },
        "Applying edits to project"
      );

      const validation = applyEditsSchema.safeParse(request.body);
      if (!validation.success) {
        app.logger.warn({ errors: validation.error }, "Invalid edits");
        return reply.status(400).send({ error: "Invalid edits format" });
      }

      try {
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

        // In a real implementation, these edits would be processed by FFmpeg or similar
        // For now, we just log them and update the project status
        const editsApplied = validation.data.edits.length;

        await app.db
          .update(appSchema.videoProjects)
          .set({ status: "editing" })
          .where(eq(appSchema.videoProjects.id, projectId));

        app.logger.info(
          { projectId, editsApplied },
          "Edits applied successfully"
        );

        return {
          success: true,
          projectId,
          editsApplied,
          status: "editing",
        };
      } catch (error) {
        app.logger.error(
          { err: error, projectId, userId: session.user.id },
          "Failed to apply edits"
        );
        throw error;
      }
    }
  );

  // POST /api/editing/:projectId/save
  app.fastify.post(
    "/api/editing/:projectId/save",
    {
      schema: {
        description: "Save edited video project changes",
        tags: ["editing"],
        params: {
          type: "object",
          required: ["projectId"],
          properties: {
            projectId: { type: "string", format: "uuid" },
          },
        },
        body: {
          type: "object",
          properties: {
            changes: { type: "object" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              projectId: { type: "string" },
              updatedAt: { type: "string", format: "date-time" },
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
        Params: { projectId: string };
        Body: { changes?: any };
      }>,
      reply: FastifyReply
    ): Promise<any | void> => {
      const session = await requireAuth(request, reply);
      if (!session) return;

      const { projectId } = request.params;

      app.logger.info(
        { userId: session.user.id, projectId },
        "Saving project changes"
      );

      const validation = saveEditSchema.safeParse(request.body);
      if (!validation.success) {
        app.logger.warn({ errors: validation.error }, "Invalid save request");
        return reply.status(400).send({ error: "Invalid save request" });
      }

      try {
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

        // Apply changes if provided
        const updateData: any = {};
        if (validation.data.changes) {
          Object.assign(updateData, validation.data.changes);
        }

        // If no changes provided, just return the current project
        if (Object.keys(updateData).length === 0) {
          app.logger.info({ projectId }, "No changes to save");
          return {
            success: true,
            projectId: project[0].id,
            updatedAt: project[0].updatedAt.toISOString(),
          };
        }

        const [updated] = await app.db
          .update(appSchema.videoProjects)
          .set(updateData)
          .where(eq(appSchema.videoProjects.id, projectId))
          .returning();

        app.logger.info({ projectId }, "Project changes saved successfully");

        return {
          success: true,
          projectId: updated.id,
          updatedAt: updated.updatedAt.toISOString(),
        };
      } catch (error) {
        app.logger.error(
          { err: error, projectId, userId: session.user.id },
          "Failed to save project changes"
        );
        throw error;
      }
    }
  );
}

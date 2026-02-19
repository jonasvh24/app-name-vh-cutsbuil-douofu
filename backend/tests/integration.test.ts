import { describe, test, expect } from "bun:test";
import { api, authenticatedApi, signUpTestUser, expectStatus, createTestFile } from "./helpers";

describe("API Integration Tests", () => {
  // Shared state for chaining tests
  let authToken: string;
  let projectId: string;

  // ============================================================================
  // Authentication Setup
  // ============================================================================

  test("Sign up test user", async () => {
    const { token } = await signUpTestUser();
    authToken = token;
    expect(authToken).toBeDefined();
  });

  // ============================================================================
  // Video Upload Tests
  // ============================================================================

  describe("Video Upload", () => {
    test("Upload video file successfully", async () => {
      const form = new FormData();
      form.append("file", createTestFile("test-video.mp4", "dummy video content", "video/mp4"));

      const res = await authenticatedApi("/api/upload/video", authToken, {
        method: "POST",
        body: form,
      });
      await expectStatus(res, 200);

      const data = await res.json();
      expect(data.videoUrl).toBeDefined();
      expect(typeof data.videoUrl).toBe("string");
      expect(data.videoId).toBeDefined();
      expect(typeof data.videoId).toBe("string");
    });

    test("Upload video without file should fail", async () => {
      const form = new FormData();
      const res = await authenticatedApi("/api/upload/video", authToken, {
        method: "POST",
        body: form,
      });
      await expectStatus(res, 400);

      const data = await res.json();
      expect(data.error).toBeDefined();
    });
  });

  // ============================================================================
  // Projects CRUD Tests
  // ============================================================================

  describe("Projects Management", () => {
    test("Create project requires authentication", async () => {
      const res = await api("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoUrl: "https://example.com/video.mp4",
          prompt: "Make it funnier",
        }),
      });
      await expectStatus(res, 401);
    });

    test("Create project with missing required fields", async () => {
      const res = await authenticatedApi("/api/projects", authToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoUrl: "https://example.com/video.mp4",
          // missing prompt
        }),
      });
      await expectStatus(res, 400);
    });

    test("Create project successfully", async () => {
      const res = await authenticatedApi("/api/projects", authToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoUrl: "https://example.com/test-video.mp4",
          prompt: "Make it more engaging",
        }),
      });
      await expectStatus(res, 201);

      const data = await res.json();
      expect(data.projectId).toBeDefined();
      expect(typeof data.projectId).toBe("string");
      expect(data.status).toBeDefined();
      projectId = data.projectId;
    });

    test("Get all projects for authenticated user", async () => {
      const res = await authenticatedApi("/api/projects", authToken);
      await expectStatus(res, 200);

      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThanOrEqual(1);

      // Verify structure of first project
      const project = data[0];
      expect(project.id).toBeDefined();
      expect(project.originalVideoUrl).toBeDefined();
      expect(project.prompt).toBeDefined();
      expect(project.status).toBeDefined();
      expect(project.createdAt).toBeDefined();
    });

    test("Get all projects requires authentication", async () => {
      const res = await api("/api/projects");
      await expectStatus(res, 401);
    });

    test("Get project by ID successfully", async () => {
      const res = await authenticatedApi(`/api/projects/${projectId}`, authToken);
      await expectStatus(res, 200);

      const data = await res.json();
      expect(data.id).toBe(projectId);
      expect(data.originalVideoUrl).toBeDefined();
      expect(data.prompt).toBeDefined();
      expect(data.status).toBeDefined();
    });

    test("Get project by ID requires authentication", async () => {
      const res = await api(`/api/projects/${projectId}`);
      await expectStatus(res, 401);
    });

    test("Get nonexistent project returns 404", async () => {
      const fakeId = "00000000-0000-0000-0000-000000000000";
      const res = await authenticatedApi(`/api/projects/${fakeId}`, authToken);
      await expectStatus(res, 404);

      const data = await res.json();
      expect(data.error).toBeDefined();
    });

    test("Get project with invalid UUID format returns 400", async () => {
      const res = await authenticatedApi(`/api/projects/invalid-uuid`, authToken);
      await expectStatus(res, 400);
    });

    test("Regenerate project with new prompt successfully", async () => {
      const res = await authenticatedApi(`/api/projects/${projectId}/regenerate`, authToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: "Make it shorter and more dramatic",
        }),
      });
      await expectStatus(res, 200);

      const data = await res.json();
      expect(data.id).toBe(projectId);
      expect(data.status).toBeDefined();
      expect(data.prompt).toBe("Make it shorter and more dramatic");
    });

    test("Regenerate project with missing prompt fails", async () => {
      const res = await authenticatedApi(`/api/projects/${projectId}/regenerate`, authToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      await expectStatus(res, 400);
    });

    test("Regenerate requires authentication", async () => {
      const res = await api(`/api/projects/${projectId}/regenerate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: "Test",
        }),
      });
      await expectStatus(res, 401);
    });

    test("Regenerate nonexistent project returns 404", async () => {
      const fakeId = "00000000-0000-0000-0000-000000000000";
      const res = await authenticatedApi(`/api/projects/${fakeId}/regenerate`, authToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: "Test",
        }),
      });
      await expectStatus(res, 404);
    });

    test("Publish project with valid platforms", async () => {
      const res = await authenticatedApi(`/api/projects/${projectId}/publish`, authToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platforms: ["tiktok"],
        }),
      });
      await expectStatus(res, 200);

      const data = await res.json();
      expect(data.success).toBeDefined();
      expect(typeof data.success).toBe("boolean");
      expect(data.publishedTo).toBeDefined();
      expect(Array.isArray(data.publishedTo)).toBe(true);
    });

    test("Publish project to multiple platforms", async () => {
      const res = await authenticatedApi(`/api/projects/${projectId}/publish`, authToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platforms: ["tiktok", "youtube"],
        }),
      });
      await expectStatus(res, 200);

      const data = await res.json();
      expect(data.success).toBeDefined();
      expect(data.publishedTo).toBeDefined();
    });

    test("Publish with empty platforms array fails", async () => {
      const res = await authenticatedApi(`/api/projects/${projectId}/publish`, authToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platforms: [],
        }),
      });
      await expectStatus(res, 400);
    });

    test("Publish with missing platforms fails", async () => {
      const res = await authenticatedApi(`/api/projects/${projectId}/publish`, authToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      await expectStatus(res, 400);
    });

    test("Publish requires authentication", async () => {
      const res = await api(`/api/projects/${projectId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platforms: ["tiktok"],
        }),
      });
      await expectStatus(res, 401);
    });

    test("Publish nonexistent project returns 404", async () => {
      const fakeId = "00000000-0000-0000-0000-000000000000";
      const res = await authenticatedApi(`/api/projects/${fakeId}/publish`, authToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platforms: ["tiktok"],
        }),
      });
      await expectStatus(res, 404);
    });
  });
});

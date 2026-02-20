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

  // ============================================================================
  // Credits Tests
  // ============================================================================

  describe("Credits Management", () => {
    test("Get user credits requires authentication", async () => {
      const res = await api("/api/user/credits");
      await expectStatus(res, 401);
    });

    test("Get user credits successfully", async () => {
      const res = await authenticatedApi("/api/user/credits", authToken);
      await expectStatus(res, 200);

      const data = await res.json();
      expect(data.credits).toBeDefined();
      expect(typeof data.credits).toBe("number");
      expect(data.subscriptionStatus).toBeDefined();
      expect(["free", "monthly", "yearly"]).toContain(data.subscriptionStatus);
    });

    test("Deduct credits requires authentication", async () => {
      const res = await api("/api/user/credits/deduct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: "00000000-0000-0000-0000-000000000000",
        }),
      });
      await expectStatus(res, 401);
    });

    test("Deduct credits with missing projectId fails", async () => {
      const res = await authenticatedApi("/api/user/credits/deduct", authToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      await expectStatus(res, 400);
    });

    test("Deduct credits with invalid UUID format fails", async () => {
      const res = await authenticatedApi("/api/user/credits/deduct", authToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: "invalid-uuid",
        }),
      });
      await expectStatus(res, 400);
    });

    test("Deduct credits with nonexistent project fails", async () => {
      const res = await authenticatedApi("/api/user/credits/deduct", authToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: "00000000-0000-0000-0000-000000000000",
        }),
      });
      await expectStatus(res, 400);

      const data = await res.json();
      expect(data.error).toBeDefined();
    });

    test("Deduct credits for valid project successfully", async () => {
      const res = await authenticatedApi("/api/user/credits/deduct", authToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: projectId,
        }),
      });
      await expectStatus(res, 200);

      const data = await res.json();
      expect(data.success).toBeDefined();
      expect(typeof data.success).toBe("boolean");
      expect(data.remainingCredits).toBeDefined();
      expect(typeof data.remainingCredits).toBe("number");
    });
  });

  // ============================================================================
  // Subscriptions Tests
  // ============================================================================

  describe("Subscriptions Management", () => {
    test("Get subscription status requires authentication", async () => {
      const res = await api("/api/subscriptions/status");
      await expectStatus(res, 401);
    });

    test("Get subscription status successfully", async () => {
      const res = await authenticatedApi("/api/subscriptions/status", authToken);
      await expectStatus(res, 200);

      const data = await res.json();
      expect(data.status).toBeDefined();
      expect(["free", "monthly", "yearly"]).toContain(data.status);
      expect(data.hasActiveSubscription).toBeDefined();
      expect(typeof data.hasActiveSubscription).toBe("boolean");
    });

    test("Create checkout requires authentication", async () => {
      const res = await api("/api/subscriptions/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: "monthly",
        }),
      });
      await expectStatus(res, 401);
    });

    test("Create checkout with invalid plan fails", async () => {
      const res = await authenticatedApi("/api/subscriptions/create-checkout", authToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: "invalid-plan",
        }),
      });
      await expectStatus(res, 400);
    });

    test("Create checkout with missing plan fails", async () => {
      const res = await authenticatedApi("/api/subscriptions/create-checkout", authToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      await expectStatus(res, 400);
    });

    test("Create checkout for monthly plan successfully", async () => {
      const res = await authenticatedApi("/api/subscriptions/create-checkout", authToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: "monthly",
        }),
      });
      await expectStatus(res, 200);

      const data = await res.json();
      expect(data.checkoutUrl).toBeDefined();
      expect(typeof data.checkoutUrl).toBe("string");
      expect(data.sessionId).toBeDefined();
      expect(typeof data.sessionId).toBe("string");
    });

    test("Create checkout for yearly plan successfully", async () => {
      const res = await authenticatedApi("/api/subscriptions/create-checkout", authToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: "yearly",
        }),
      });
      await expectStatus(res, 200);

      const data = await res.json();
      expect(data.checkoutUrl).toBeDefined();
      expect(data.sessionId).toBeDefined();
    });

    test("Cancel subscription requires authentication", async () => {
      const res = await api("/api/subscriptions/cancel", {
        method: "POST",
      });
      await expectStatus(res, 401);
    });

    test("Cancel subscription successfully", async () => {
      const res = await authenticatedApi("/api/subscriptions/cancel", authToken, {
        method: "POST",
      });
      await expectStatus(res, 200);

      const data = await res.json();
      expect(data.success).toBeDefined();
      expect(typeof data.success).toBe("boolean");
      expect(data.message).toBeDefined();
      expect(typeof data.message).toBe("string");
    });

    test("Webhook endpoint accepts POST", async () => {
      const res = await api("/api/subscriptions/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "test_webhook",
        }),
      });
      await expectStatus(res, 200);
    });
  });

  // ============================================================================
  // Payments Tests
  // ============================================================================

  describe("Payments Management", () => {
    test("Initiate payment requires authentication", async () => {
      const res = await api("/api/payments/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: "monthly",
          paymentMethod: "card",
        }),
      });
      await expectStatus(res, 401);
    });

    test("Initiate payment with missing required fields fails", async () => {
      const res = await authenticatedApi("/api/payments/initiate", authToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: "monthly",
        }),
      });
      await expectStatus(res, 400);
    });

    test("Initiate payment with card method successfully", async () => {
      const res = await authenticatedApi("/api/payments/initiate", authToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: "monthly",
          paymentMethod: "card",
        }),
      });
      await expectStatus(res, 200);

      const data = await res.json();
      expect(data.success).toBeDefined();
      expect(data.paymentMethod).toBe("card");
    });

    test("Initiate payment with paypal method", async () => {
      const res = await authenticatedApi("/api/payments/initiate", authToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: "monthly",
          paymentMethod: "paypal",
          paypalEmail: "test@example.com",
        }),
      });
      await expectStatus(res, 200);

      const data = await res.json();
      expect(data.success).toBeDefined();
      expect(data.paymentMethod).toBe("paypal");
    });

    test("Initiate payment with iban method", async () => {
      const res = await authenticatedApi("/api/payments/initiate", authToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: "yearly",
          paymentMethod: "iban",
          iban: "DE89370400440532013000",
        }),
      });
      await expectStatus(res, 200);

      const data = await res.json();
      expect(data.success).toBeDefined();
      expect(data.paymentMethod).toBe("iban");
    });

    test("Initiate payment with invalid plan fails", async () => {
      const res = await authenticatedApi("/api/payments/initiate", authToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: "invalid-plan",
          paymentMethod: "card",
        }),
      });
      await expectStatus(res, 400);
    });

    test("Confirm manual payment requires authentication", async () => {
      const res = await api("/api/payments/confirm-manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: "monthly",
          paymentMethod: "paypal",
          transactionReference: "TXN123456",
        }),
      });
      await expectStatus(res, 401);
    });

    test("Confirm manual payment with missing fields fails", async () => {
      const res = await authenticatedApi("/api/payments/confirm-manual", authToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: "monthly",
        }),
      });
      await expectStatus(res, 400);
    });

    test("Confirm manual payment with paypal successfully", async () => {
      const res = await authenticatedApi("/api/payments/confirm-manual", authToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: "monthly",
          paymentMethod: "paypal",
          transactionReference: "PAYPAL_TXN_123",
        }),
      });
      await expectStatus(res, 200);

      const data = await res.json();
      expect(data.success).toBeDefined();
      expect(data.subscriptionStatus).toBeDefined();
    });

    test("Confirm manual payment with iban successfully", async () => {
      const res = await authenticatedApi("/api/payments/confirm-manual", authToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: "yearly",
          paymentMethod: "iban",
          transactionReference: "IBAN_TXN_456",
        }),
      });
      await expectStatus(res, 200);

      const data = await res.json();
      expect(data.success).toBeDefined();
      expect(data.subscriptionStatus).toBeDefined();
    });

    test("Confirm manual payment with invalid method fails", async () => {
      const res = await authenticatedApi("/api/payments/confirm-manual", authToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: "monthly",
          paymentMethod: "card",
          transactionReference: "TXN123",
        }),
      });
      await expectStatus(res, 400);
    });
  });

  // ============================================================================
  // Music Tests
  // ============================================================================

  describe("Music Management", () => {
    test("Search music requires authentication", async () => {
      const res = await api("/api/music/search?query=piano");
      await expectStatus(res, 401);
    });

    test("Search music with missing query parameter fails", async () => {
      const res = await authenticatedApi("/api/music/search", authToken);
      await expectStatus(res, 400);
    });

    test("Search music successfully", async () => {
      const res = await authenticatedApi("/api/music/search?query=piano", authToken);
      await expectStatus(res, 200);

      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
      if (data.length > 0) {
        expect(data[0].id).toBeDefined();
        expect(data[0].title).toBeDefined();
        expect(data[0].artist).toBeDefined();
        expect(data[0].duration).toBeDefined();
        expect(data[0].genre).toBeDefined();
        expect(data[0].url).toBeDefined();
      }
    });

    test("Search music with custom limit", async () => {
      const res = await authenticatedApi("/api/music/search?query=jazz&limit=5", authToken);
      await expectStatus(res, 200);

      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
    });

    test("Import music requires authentication", async () => {
      const res = await api("/api/music/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Test Song",
          artist: "Test Artist",
          duration: 180,
          genre: "Pop",
        }),
      });
      await expectStatus(res, 401);
    });

    test("Import music with missing required fields fails", async () => {
      const res = await authenticatedApi("/api/music/import", authToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Test Song",
          artist: "Test Artist",
        }),
      });
      await expectStatus(res, 400);
    });

    test("Import music successfully", async () => {
      const res = await authenticatedApi("/api/music/import", authToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "My Custom Song",
          artist: "Local Artist",
          duration: 240,
          genre: "Indie",
        }),
      });
      await expectStatus(res, 200);

      const data = await res.json();
      expect(data.id).toBeDefined();
      expect(data.title).toBe("My Custom Song");
      expect(data.artist).toBe("Local Artist");
      expect(data.duration).toBe(240);
      expect(data.genre).toBe("Indie");
      expect(data.url).toBeDefined();
    });

    test("Attach music to project requires authentication", async () => {
      const res = await api("/api/music/attach-to-project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: projectId,
          musicUrl: "https://example.com/music.mp3",
        }),
      });
      await expectStatus(res, 401);
    });

    test("Attach music with missing required fields fails", async () => {
      const res = await authenticatedApi("/api/music/attach-to-project", authToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: projectId,
        }),
      });
      await expectStatus(res, 400);
    });

    test("Attach music to nonexistent project fails", async () => {
      const fakeId = "00000000-0000-0000-0000-000000000000";
      const res = await authenticatedApi("/api/music/attach-to-project", authToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: fakeId,
          musicUrl: "https://example.com/music.mp3",
        }),
      });
      await expectStatus(res, 404);
    });

    test("Attach music to project successfully", async () => {
      const res = await authenticatedApi("/api/music/attach-to-project", authToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: projectId,
          musicUrl: "https://example.com/background-music.mp3",
        }),
      });
      await expectStatus(res, 200);

      const data = await res.json();
      expect(data.success).toBeDefined();
      expect(data.projectId).toBe(projectId);
      expect(data.musicUrl).toBe("https://example.com/background-music.mp3");
    });
  });

  // ============================================================================
  // Editing Tests
  // ============================================================================

  describe("Video Editing", () => {
    test("Retrieve edited video requires authentication", async () => {
      const res = await api(`/api/editing/${projectId}/retrieve`);
      await expectStatus(res, 401);
    });

    test("Retrieve edited video with invalid UUID format fails", async () => {
      const res = await authenticatedApi("/api/editing/invalid-uuid/retrieve", authToken);
      await expectStatus(res, 400);
    });

    test("Retrieve nonexistent project fails", async () => {
      const fakeId = "00000000-0000-0000-0000-000000000000";
      const res = await authenticatedApi(`/api/editing/${fakeId}/retrieve`, authToken);
      await expectStatus(res, 404);
    });

    test("Retrieve edited video successfully", async () => {
      const res = await authenticatedApi(`/api/editing/${projectId}/retrieve`, authToken);
      await expectStatus(res, 200);

      const data = await res.json();
      expect(data.id).toBeDefined();
      expect(data.userId).toBeDefined();
      expect(data.originalVideoUrl).toBeDefined();
      expect(data.prompt).toBeDefined();
      expect(data.status).toBeDefined();
      expect(data.createdAt).toBeDefined();
      expect(data.updatedAt).toBeDefined();
    });

    test("Apply edits requires authentication", async () => {
      const res = await api(`/api/editing/${projectId}/apply-edits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          edits: [
            {
              type: "trim",
              params: { start: 0, end: 10 },
            },
          ],
        }),
      });
      await expectStatus(res, 401);
    });

    test("Apply edits with missing edits array fails", async () => {
      const res = await authenticatedApi(`/api/editing/${projectId}/apply-edits`, authToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      await expectStatus(res, 400);
    });

    test("Apply edits to nonexistent project fails", async () => {
      const fakeId = "00000000-0000-0000-0000-000000000000";
      const res = await authenticatedApi(`/api/editing/${fakeId}/apply-edits`, authToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          edits: [
            {
              type: "trim",
              params: { start: 0, end: 5 },
            },
          ],
        }),
      });
      await expectStatus(res, 404);
    });

    test("Apply edits successfully", async () => {
      const res = await authenticatedApi(`/api/editing/${projectId}/apply-edits`, authToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          edits: [
            {
              type: "trim",
              params: { start: 0, end: 30 },
            },
          ],
        }),
      });
      await expectStatus(res, 200);

      const data = await res.json();
      expect(data.success).toBeDefined();
      expect(data.projectId).toBe(projectId);
      expect(data.editsApplied).toBeDefined();
      expect(typeof data.editsApplied).toBe("number");
      expect(data.status).toBeDefined();
    });

    test("Apply multiple edits successfully", async () => {
      const res = await authenticatedApi(`/api/editing/${projectId}/apply-edits`, authToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          edits: [
            {
              type: "trim",
              params: { start: 5, end: 25 },
            },
            {
              type: "timing",
              params: { speed: 1.5 },
            },
          ],
        }),
      });
      await expectStatus(res, 200);

      const data = await res.json();
      expect(data.success).toBeDefined();
      expect(data.editsApplied).toBeGreaterThanOrEqual(1);
    });

    test("Save edits requires authentication", async () => {
      const res = await api(`/api/editing/${projectId}/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          changes: {},
        }),
      });
      await expectStatus(res, 401);
    });

    test("Save edits with empty changes object successfully", async () => {
      const res = await authenticatedApi(`/api/editing/${projectId}/save`, authToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          changes: {},
        }),
      });
      await expectStatus(res, 200);

      const data = await res.json();
      expect(data.success).toBeDefined();
      expect(data.projectId).toBe(projectId);
      expect(data.updatedAt).toBeDefined();
    });

    test("Save edits to nonexistent project fails", async () => {
      const fakeId = "00000000-0000-0000-0000-000000000000";
      const res = await authenticatedApi(`/api/editing/${fakeId}/save`, authToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          changes: { title: "Updated Title" },
        }),
      });
      await expectStatus(res, 404);
    });

    test("Save edits with changes object successfully", async () => {
      const res = await authenticatedApi(`/api/editing/${projectId}/save`, authToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          changes: {
            title: "Updated Video Title",
            description: "New description",
          },
        }),
      });
      await expectStatus(res, 200);

      const data = await res.json();
      expect(data.success).toBeDefined();
      expect(data.projectId).toBe(projectId);
    });
  });

  // ============================================================================
  // Admin Tests
  // ============================================================================

  describe("Admin Operations", () => {
    test("Grant infinite credits requires authentication", async () => {
      const res = await api("/api/admin/grant-infinite-credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "test@example.com",
        }),
      });
      await expectStatus(res, 401);
    });

    test("Grant infinite credits with missing email fails", async () => {
      const res = await authenticatedApi("/api/admin/grant-infinite-credits", authToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      await expectStatus(res, 400);
    });

    test("Grant infinite credits with invalid email format fails", async () => {
      const res = await authenticatedApi("/api/admin/grant-infinite-credits", authToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "not-an-email",
        }),
      });
      await expectStatus(res, 400);
    });

    test("Grant infinite credits to nonexistent user fails", async () => {
      const res = await authenticatedApi("/api/admin/grant-infinite-credits", authToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "nonexistent@example.com",
        }),
      });
      await expectStatus(res, 404);
    });
  });
});

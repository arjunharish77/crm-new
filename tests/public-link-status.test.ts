import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ form: vi.fn(), survey: vi.fn() }));
vi.mock("@/lib/server/crm", () => ({ getPublicForm: mocks.form }));
vi.mock("@/lib/repositories/case-survey-postgres", () => ({ getCaseSurveyForPublic: mocks.survey, submitCaseSurveyResponse: vi.fn() }));

beforeEach(() => vi.resetAllMocks());

describe("public missing-link responses", () => {
    it("returns 404 for a missing form instead of an empty success", async () => {
        mocks.form.mockResolvedValue(null);
        const { GET } = await import("@/app/api/public/forms/[identifier]/route");
        const result = await GET(new Request("http://localhost/api/public/forms/missing"), { params: Promise.resolve({ identifier: "missing" }) });
        expect(result.status).toBe(404);
    });
    it("preserves closed form metadata for the closed-page state", async () => {
        mocks.form.mockResolvedValue({ id: "closed", isActive: false });
        const { GET } = await import("@/app/api/public/forms/[identifier]/route");
        const result = await GET(new Request("http://localhost/api/public/forms/closed"), { params: Promise.resolve({ identifier: "closed" }) });
        expect(result.status).toBe(200);
        expect(await result.json()).toMatchObject({ isActive: false });
    });
    it("returns 404 for a missing survey", async () => {
        mocks.survey.mockResolvedValue(null);
        const { GET } = await import("@/app/api/public/case-surveys/[id]/route");
        const result = await GET(new Request("http://localhost/api/public/case-surveys/missing"), { params: Promise.resolve({ id: "missing" }) });
        expect(result.status).toBe(404);
    });
    it("preserves an existing response so the page can show its receipt", async () => {
        mocks.survey.mockResolvedValue({ id: "survey", respondedAt: "2026-09-12T00:00:00Z", score: 4 });
        const { GET } = await import("@/app/api/public/case-surveys/[id]/route");
        const result = await GET(new Request("http://localhost/api/public/case-surveys/survey"), { params: Promise.resolve({ id: "survey" }) });
        expect(result.status).toBe(200);
        expect(await result.json()).toMatchObject({ score: 4 });
    });
});

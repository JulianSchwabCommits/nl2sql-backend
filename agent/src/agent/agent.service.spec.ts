import { AgentService } from "./agent.service";

describe("AgentService", () => {
  let service: any;
  let mockOpenAI: any;
  let mockDataClient: any;
  const mockConfig = {
    maxRows: 25,
    maxToolIterations: 10,
    maxRequestsPerDay: 100,
    rateLimitWindowMs: 86400000,
    maxHistoryMessages: 10,
    historyFetchLimit: 10,
    openaiModel: "gpt-4o-mini",
    openaiBaseUrl: "https://api.openai.com/v1/chat/completions",
  };

  beforeEach(() => {
    mockOpenAI = {
      chatWithTools: jest.fn(),
    };
    mockDataClient = {
      executeRead: jest.fn(),
      executeWrite: jest.fn(),
      executeReadWithCredentials: jest.fn(),
      executeWriteWithCredentials: jest.fn(),
      getConnectionCredentials: jest.fn(),
      listUserConnections: jest.fn(),
      getSchemaForConnection: jest.fn(),
      checkRateLimit: jest.fn(),
      getUserLlmSettings: jest.fn().mockResolvedValue({
        provider: 'openai',
        model: 'gpt-4o-mini',
        apiKey: 'test-api-key',
      }),
    };
    service = new AgentService(mockOpenAI, mockDataClient, mockConfig);
  });

  describe("enforceLimitOnSelect", () => {
    it("appends LIMIT when missing", () => {
      const result = service["enforceLimitOnSelect"]('SELECT * FROM "Food"');
      expect(result).toBe('SELECT * FROM "Food" LIMIT 25');
    });

    it("strips trailing semicolon before appending LIMIT", () => {
      const result = service["enforceLimitOnSelect"]('SELECT * FROM "Food";');
      expect(result).toBe('SELECT * FROM "Food" LIMIT 25');
    });

    it("caps existing LIMIT > maxRows to maxRows", () => {
      const result = service["enforceLimitOnSelect"](
        'SELECT * FROM "Food" LIMIT 100',
      );
      expect(result).toBe('SELECT * FROM "Food" LIMIT 25');
    });

    it("leaves LIMIT <= maxRows unchanged", () => {
      const result = service["enforceLimitOnSelect"](
        'SELECT * FROM "Food" LIMIT 10',
      );
      expect(result).toBe('SELECT * FROM "Food" LIMIT 10');
    });

    it("leaves LIMIT equal to maxRows unchanged", () => {
      const result = service["enforceLimitOnSelect"](
        'SELECT * FROM "Food" LIMIT 25',
      );
      expect(result).toBe('SELECT * FROM "Food" LIMIT 25');
    });

    it("handles case-insensitive LIMIT", () => {
      const result = service["enforceLimitOnSelect"](
        'SELECT * FROM "Food" limit 50',
      );
      expect(result).toBe('SELECT * FROM "Food" LIMIT 25');
    });

    it("handles LIMIT in uppercase", () => {
      const result = service["enforceLimitOnSelect"](
        'SELECT * FROM "Food" LIMIT 50',
      );
      expect(result).toBe('SELECT * FROM "Food" LIMIT 25');
    });
  });

  describe("cancelRequest", () => {
    it("aborts active request and returns true", () => {
      const controller = new AbortController();
      service["activeRequests"].set("client-1", controller);

      const result = service.cancelRequest("client-1");

      expect(result).toBe(true);
      expect(controller.signal.aborted).toBe(true);
      expect(service["activeRequests"].has("client-1")).toBe(false);
    });

    it("returns false for unknown clientId", () => {
      const result = service.cancelRequest("unknown-client");
      expect(result).toBe(false);
    });
  });

  describe("handleMessage", () => {
    it("returns rate limit message when over quota", async () => {
      mockDataClient.checkRateLimit.mockResolvedValue({ allowed: false });

      const result = await service.handleMessage("hello", [], "user-1");

      expect(result.error).toBe("rate_limit");
      expect(result.reply).toContain("Daily request limit reached");
      expect(result.queries).toEqual([]);
    });

    it("returns unavailable message when rate limit check fails", async () => {
      mockDataClient.checkRateLimit.mockRejectedValue(new Error("Redis down"));

      const result = await service.handleMessage("hello", [], "user-1");

      expect(result.error).toBe("rate_limit_unavailable");
      expect(result.reply).toContain("Unable to verify");
    });

    it("calls agent loop when under quota", async () => {
      mockDataClient.checkRateLimit.mockResolvedValue({ allowed: true });
      mockOpenAI.chatWithTools.mockResolvedValue({
        text: "Here are the results",
      });

      const result = await service.handleMessage("hello", [], "user-1");

      expect(result.reply).toBe("Here are the results");
      expect(result.queries).toEqual([]);
    });

    it("skips rate limit check when no userId", async () => {
      await expect(service.handleMessage("hello", [])).rejects.toThrow("No userid");
      expect(mockDataClient.checkRateLimit).not.toHaveBeenCalled();
    });
  });

  describe("executeAgentLoop (via handleMessage)", () => {
    beforeEach(() => {
      mockDataClient.checkRateLimit.mockResolvedValue({ allowed: true });
    });

    it("returns text reply when LLM returns plain text", async () => {
      mockOpenAI.chatWithTools.mockResolvedValue({ text: "Answer is 42" });

      const result = await service.handleMessage("question", [], "user-1");

      expect(result.reply).toBe("Answer is 42");
      expect(result.queries).toEqual([]);
    });

    it("dispatches read_query tool call and accumulates query", async () => {
      const rows = [{ id: 1, name: "Apple" }];
      mockDataClient.executeReadWithCredentials.mockResolvedValue(rows);
      mockDataClient.getConnectionCredentials.mockResolvedValue({
        host: "localhost",
        port: 5432,
        database: "food",
        username: "user",
        password: "pass",
        ssl: false,
      });

      mockOpenAI.chatWithTools
        .mockResolvedValueOnce({
          functionCall: { name: "read_query", args: { sql: 'SELECT * FROM "Food"', connectionId: "conn-1" } },
        })
        .mockResolvedValueOnce({
          functionCall: {
            name: "stop",
            args: { message: "Found 1 food" },
          },
        });

      const result = await service.handleMessage("find foods", [], "user-1");

      expect(mockDataClient.executeReadWithCredentials).toHaveBeenCalledWith(
        'SELECT * FROM "Food" LIMIT 25',
        expect.objectContaining({ host: "localhost" }),
      );
      expect(result.reply).toBe("Found 1 food");
      expect(result.queries).toHaveLength(1);
      expect(result.queries[0].operation).toBe("SELECT");
      expect(result.queries[0].results).toEqual(rows);
    });

    it("dispatches stop tool call and returns message", async () => {
      mockOpenAI.chatWithTools.mockResolvedValueOnce({
        functionCall: {
          name: "stop",
          args: { message: "I cannot help with that." },
        },
      });

      const result = await service.handleMessage("bad request", [], "user-1");

      expect(result.reply).toBe("I cannot help with that.");
    });

    it("stops at maxToolIterations", async () => {
      mockDataClient.executeRead.mockResolvedValue([]);
      mockOpenAI.chatWithTools.mockResolvedValue({
        functionCall: { name: "get", args: { sql: "SELECT 1" } },
      });

      const result = await service.handleMessage("loop", [], "user-1");

      expect(result.reply).toContain("maximum number of steps");
      expect(mockOpenAI.chatWithTools).toHaveBeenCalledTimes(
        mockConfig.maxToolIterations,
      );
    });

    it('returns "No response from model" when LLM returns empty text', async () => {
      mockOpenAI.chatWithTools.mockResolvedValue({ text: "" });

      const result = await service.handleMessage("test", [], "user-1");

      expect(result.reply).toBe("No response from model");
    });

    it("handles unknown tool name gracefully", async () => {
      mockOpenAI.chatWithTools
        .mockResolvedValueOnce({
          functionCall: { name: "unknown_tool", args: {} },
        })
        .mockResolvedValueOnce({ text: "Fallback answer" });

      const result = await service.handleMessage("test", [], "user-1");

      expect(result.reply).toBe("Fallback answer");
    });

    it("rejects write when SQL does not match expected type", async () => {
      mockDataClient.getConnectionCredentials.mockResolvedValue({
        host: "localhost",
        port: 5432,
        database: "food",
        username: "user",
        password: "pass",
        ssl: false,
      });

      mockOpenAI.chatWithTools
        .mockResolvedValueOnce({
          functionCall: {
            name: "write_query",
            args: { sql: 'DELETE FROM "Food"', operation: "INSERT", connectionId: "conn-1" },
          },
        })
        .mockResolvedValueOnce({
          functionCall: {
            name: "stop",
            args: { message: "Noted the error" },
          },
        });

      const result = await service.handleMessage("test", [], "user-1");

      expect(mockDataClient.executeWriteWithCredentials).not.toHaveBeenCalled();
      expect(result.queries[0].error).toContain("Expected INSERT");
    });

    it("trims history to maxHistoryMessages", async () => {
      const longHistory = Array.from({ length: 20 }, (_, i) => ({
        role: "user" as const,
        content: `message ${i}`,
      }));

      mockOpenAI.chatWithTools.mockResolvedValue({ text: "done" });

      await service.handleMessage("new msg", longHistory, "user-1");

      const callArgs = mockOpenAI.chatWithTools.mock.calls[0][0];
      // maxHistoryMessages (10) trimmed from history + 1 new user message
      expect(callArgs).toHaveLength(11);
    });
  });
});

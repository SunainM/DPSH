"use strict";

// Set required env vars BEFORE any require() so the module-level throw is satisfied
process.env.MONGO_URL  = "mongodb://localhost:27017/test";
process.env.BROKER_URL = "mqtt://localhost:1883";
process.env.DB_NAME    = "testdb";
process.env.FACE_COLL  = "faces";
process.env.P_KEEP_MOOD = "0"; // force mood to always refresh (deterministic assignment path)

// Mock dotenv so it doesn't try to read a missing .env file
jest.mock("dotenv", () => ({ config: jest.fn() }));

// Mock mqtt — the module IIFE calls mqtt.connect() on load
jest.mock("mqtt", () => ({
  connect: jest.fn(() => ({
    on:        jest.fn(),
    subscribe: jest.fn(),
    publish:   jest.fn(),
    end:       jest.fn(),
  })),
}));

// Mock mongodb — the module IIFE calls new MongoClient(...).connect() on load
jest.mock("mongodb", () => ({
  MongoClient: jest.fn().mockImplementation(() => ({
    connect:   jest.fn().mockResolvedValue(undefined),
    db:        jest.fn().mockReturnValue({
      collection: jest.fn().mockReturnValue({}),
    }),
    close: jest.fn(),
  })),
}));

const { buildMessageHandler } = require("../../src/controllers/faceMLSim");
const { hashFace } = require("../../src/common/hashFace");

// Helpers
const SIZE = 4;
const makeFace = (size, val) =>
  Array.from({ length: size }, () =>
    Array.from({ length: size }, () => [val, val, val])
  );
const toBuffer = (obj) => Buffer.from(JSON.stringify(obj));

const VALID_MOODS = ["relax", "focus", "sleep", "energize"];

describe("buildMessageHandler", () => {
  let mockPublish;
  let mockClient;
  let moodByUser;
  let col;

  beforeEach(() => {
    mockPublish = jest.fn();
    mockClient  = { publish: mockPublish };
    moodByUser  = new Map();
    col = {
      find: jest.fn().mockReturnValue({ toArray: jest.fn().mockResolvedValue([]) }),
    };
  });

  test("ignores a message with invalid JSON — no publish called", async () => {
    const handler = buildMessageHandler({ col, client: mockClient, moodByUser });
    await handler("homeA/living/face", Buffer.from("not-json!!"));
    expect(mockPublish).not.toHaveBeenCalled();
  });

  test("publishes empty FaceNames and mood/in when faces array is empty", async () => {
    const handler = buildMessageHandler({ col, client: mockClient, moodByUser });
    await handler("homeA/living/face", toBuffer({ faces: [], count: 0 }));

    expect(mockPublish).toHaveBeenCalledTimes(2);

    const [faceTopic, faceJson] = mockPublish.mock.calls[0];
    expect(faceTopic).toBe("homeA/living/FaceNames");
    expect(JSON.parse(faceJson)).toMatchObject({ count: 0, names: [], user_moods: [] });

    const [moodTopic, moodJson] = mockPublish.mock.calls[1];
    expect(moodTopic).toBe("homeA/living/mood/in");
    expect(JSON.parse(moodJson)).toEqual([]);
  });

  test("short-circuits on count:0 even if faces array is non-empty", async () => {
    const handler = buildMessageHandler({ col, client: mockClient, moodByUser });
    await handler("homeA/hallway/face", toBuffer({ faces: [makeFace(SIZE, 10)], count: 0 }));

    expect(mockPublish).toHaveBeenCalledTimes(2);
    const [, faceJson] = mockPublish.mock.calls[0];
    expect(JSON.parse(faceJson).count).toBe(0);
  });

  test("resolves a known face from DB and returns their name", async () => {
    const face = makeFace(SIZE, 77);
    const hash = hashFace(face);
    col.find.mockReturnValue({
      toArray: jest.fn().mockResolvedValue([
        { face_hash: hash, name: "Alice", user_id: "u-alice" },
      ]),
    });

    const handler = buildMessageHandler({ col, client: mockClient, moodByUser });
    await handler("homeA/bed1/face", toBuffer({ faces: [face], count: 1 }));

    expect(mockPublish).toHaveBeenCalledTimes(2);
    const out = JSON.parse(mockPublish.mock.calls[0][1]);
    expect(out.names).toContain("Alice");
    expect(out.user_moods[0].id).toBe("u-alice");
    expect(VALID_MOODS).toContain(out.user_moods[0].mood);
  });

  test("returns 'unknown' for a face not in the DB", async () => {
    // col.find returns [] — no matching record
    const handler = buildMessageHandler({ col, client: mockClient, moodByUser });
    await handler("homeA/bed2/face", toBuffer({ faces: [makeFace(SIZE, 200)], count: 1 }));

    const out = JSON.parse(mockPublish.mock.calls[0][1]);
    expect(out.names).toContain("unknown");
    expect(VALID_MOODS).toContain(out.user_moods[0].mood);
  });

  test("publishes empty fallback when Mongo throws", async () => {
    col.find.mockReturnValue({
      toArray: jest.fn().mockRejectedValue(new Error("DB timeout")),
    });

    const handler = buildMessageHandler({ col, client: mockClient, moodByUser });
    await handler("homeA/hallway/face", toBuffer({ faces: [makeFace(SIZE, 50)], count: 1 }));

    expect(mockPublish).toHaveBeenCalledTimes(2);
    const out = JSON.parse(mockPublish.mock.calls[0][1]);
    expect(out.count).toBe(0);
    expect(out.names).toEqual([]);
  });
});

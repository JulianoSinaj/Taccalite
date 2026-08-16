import { describe, it, expect } from "vitest";
import {
  captionExcerpt,
  formatCount,
  graphErrorMessage,
  parseMediaResponse,
  parseProfileResponse,
} from "@/lib/instagram/parse";

const image = {
  id: "1",
  caption: "Porchetta del sabato 🔥\n\n#porchetta #ancona",
  media_type: "IMAGE",
  media_url: "https://scontent-fco2-1.cdninstagram.com/v/t51/1.jpg",
  permalink: "https://www.instagram.com/p/abc/",
  timestamp: "2026-08-15T10:00:00+0000",
  like_count: 42,
  comments_count: 3,
};
const video = {
  id: "2",
  media_type: "VIDEO",
  media_url: "https://scontent.cdninstagram.com/v/t50/clip.mp4",
  thumbnail_url: "https://scontent.cdninstagram.com/v/t51/poster.jpg",
  permalink: "https://www.instagram.com/reel/def/",
  timestamp: "2026-08-14T10:00:00+0000",
};

describe("parseMediaResponse", () => {
  it("normalises image + video nodes (video uses the poster frame)", () => {
    const posts = parseMediaResponse({ data: [image, video] });
    expect(posts).toHaveLength(2);
    expect(posts[0]).toMatchObject({
      id: "1",
      mediaType: "IMAGE",
      imageUrl: image.media_url,
      likeCount: 42,
      commentsCount: 3,
    });
    expect(posts[1]).toMatchObject({
      id: "2",
      mediaType: "VIDEO",
      imageUrl: video.thumbnail_url,
      caption: null,
      likeCount: null,
    });
  });

  it("drops undisplayable nodes and honours the limit", () => {
    const bad = [
      { ...image, id: "x1", permalink: "http://insecure.example/p" }, // non-https
      { ...image, id: "x2", media_url: undefined }, // no image
      { ...image, id: "x3", media_type: "STORY" }, // unknown type
      { ...video, id: "x4", thumbnail_url: undefined }, // video without poster
      { ...image, id: "x5", timestamp: "not-a-date" },
    ];
    expect(parseMediaResponse({ data: bad })).toEqual([]);
    expect(parseMediaResponse({ data: [image, video, { ...image, id: "3" }] }, 2)).toHaveLength(2);
    expect(parseMediaResponse(null)).toEqual([]);
    expect(parseMediaResponse({ data: "nope" })).toEqual([]);
  });
});

describe("parseProfileResponse", () => {
  it("reads the rich profile and tolerates the basic one", () => {
    expect(
      parseProfileResponse({
        id: "9",
        username: "norcinerataccalite",
        name: "NorcineriaTaccalite",
        followers_count: 779,
        media_count: 61,
        profile_picture_url: "https://scontent.cdninstagram.com/pic.jpg",
      }),
    ).toEqual({
      id: "9",
      username: "norcinerataccalite",
      name: "NorcineriaTaccalite",
      followersCount: 779,
      mediaCount: 61,
      profilePictureUrl: "https://scontent.cdninstagram.com/pic.jpg",
    });
    expect(parseProfileResponse({ id: "9", username: "u" })).toMatchObject({
      followersCount: null,
      profilePictureUrl: null,
    });
    expect(parseProfileResponse({ id: "9" })).toBeNull();
  });
});

describe("helpers", () => {
  it("captionExcerpt keeps the first paragraph, strips hashtags, caps length", () => {
    expect(captionExcerpt(image.caption)).toBe("Porchetta del sabato 🔥");
    expect(captionExcerpt(null)).toBe("");
    const long = "a".repeat(50) + " " + "b".repeat(100);
    const out = captionExcerpt(long, 80);
    expect(out.endsWith("…")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(81);
  });

  it("formatCount compacts thousands/millions", () => {
    expect(formatCount(null)).toBeNull();
    expect(formatCount(779)).toBe("779");
    expect(formatCount(1_240)).toBe("1,2k");
    expect(formatCount(12_400)).toBe("12k");
    expect(formatCount(2_500_000)).toBe("2,5M");
  });

  it("graphErrorMessage surfaces the API message", () => {
    expect(graphErrorMessage({ error: { message: "Invalid OAuth access token.", code: 190 } }, "x")).toBe(
      "Invalid OAuth access token. (codice 190)",
    );
    expect(graphErrorMessage({}, "fallback")).toBe("fallback");
  });
});

import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  addUserFont,
  clearUserFonts,
  findUserFontByName,
  listUserFonts,
  removeUserFont,
  UserFontStoreError,
} from "@/lib/fonts/user-fonts";
import { resolveFont } from "@/lib/fonts/resolve";

/** Minimal valid-looking TrueType header (scaler type 0x00010000). */
function fakeTtf(name = "DemoFace.ttf"): File {
  const bytes = new Uint8Array(64);
  bytes[0] = 0x00;
  bytes[1] = 0x01;
  bytes[2] = 0x00;
  bytes[3] = 0x00;
  return new File([bytes], name, { type: "font/ttf" });
}

describe("user font store", () => {
  beforeEach(async () => {
    await clearUserFonts();
  });

  it("stores and lists a user-added TTF", async () => {
    const record = await addUserFont(fakeTtf("FancyDisplay-Regular.ttf"));
    expect(record.familyName).toBe("FancyDisplay");
    expect(record.format).toBe("truetype");
    const listed = await listUserFonts();
    expect(listed).toHaveLength(1);
    expect(await findUserFontByName("FancyDisplay")).not.toBeNull();
  });

  it("rejects non-font bytes", async () => {
    const file = new File([new TextEncoder().encode("not a font")], "x.txt");
    await expect(addUserFont(file)).rejects.toBeInstanceOf(UserFontStoreError);
  });

  it("wins over a vendored name mapping for the same family", async () => {
    const record = await addUserFont(fakeTtf("Arial.ttf"));
    const resolved = await resolveFont({ name: "Arial" });
    expect(resolved.tier).toBe("user");
    expect(resolved.familyId).toBe(`user:${record.id}`);
    expect(resolved.userBytes).toEqual(record.bytes);
  });

  it("removes individual fonts and clears all", async () => {
    const a = await addUserFont(fakeTtf("One.ttf"));
    await addUserFont(fakeTtf("Two.ttf"));
    await removeUserFont(a.id);
    expect(await listUserFonts()).toHaveLength(1);
    await clearUserFonts();
    expect(await listUserFonts()).toHaveLength(0);
  });
});

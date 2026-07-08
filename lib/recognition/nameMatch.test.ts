import { describe, it, expect } from "vitest";
import { snapToName, snapScored, snapJapanese } from "./nameMatch";

describe("snapToName (English)", () => {
  it("corrects OCR noise to the nearest species", () => {
    expect(snapToName("chansei")).toBe("Chansey");
    expect(snapToName("charlzard")).toBe("Charizard");
    expect(snapToName("zaptos")).toBe("Zapdos");
  });

  it("preserves card-name modifiers", () => {
    expect(snapToName("charizard ex")).toBe("Charizard ex");
    expect(snapToName("pikachu vmax")).toBe("Pikachu VMAX");
    expect(snapToName("dark charlzard")).toBe("Dark Charizard");
    expect(snapToName("arceus vstar")).toBe("Arceus VSTAR");
  });

  it("matches Trainer / Energy card names", () => {
    expect(snapToName("ultra bail")).toBe("Ultra Ball");
    expect(snapToName("boss orders")).toBe("Boss's Orders");
    expect(snapToName("rare candy")).toBe("Rare Candy");
  });

  it("returns null for empty input", () => {
    expect(snapToName(null)).toBeNull();
    expect(snapToName("")).toBeNull();
  });
});

describe("snapScored", () => {
  it("reports high similarity for an exact species", () => {
    const m = snapScored("charizard");
    expect(m?.display).toBe("Charizard");
    expect(m?.sim).toBeGreaterThan(0.9);
  });
});

describe("snapJapanese", () => {
  it("maps katakana Pokémon names to English", () => {
    expect(snapJapanese("リザードン")?.display).toBe("Charizard");
    expect(snapJapanese("ラッキー")?.display).toBe("Chansey");
  });

  it("maps Japanese Trainer / Item / Energy names to English", () => {
    expect(snapJapanese("モンスターボール")?.display).toBe("Poké Ball");
    expect(snapJapanese("ふしぎなアメ")?.display).toBe("Rare Candy");
    expect(snapJapanese("きほんほのおエネルギー")?.display).toBe("Fire Energy");
  });

  it("returns null when there is no Japanese text", () => {
    expect(snapJapanese("charizard")).toBeNull();
    expect(snapJapanese(null)).toBeNull();
  });
});

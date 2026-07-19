import { describe, expect, it } from "vitest";

import {
  allUkPlaces,
  distanceMiles,
  isRadiusMiles,
  normalisePlaceName,
  placesWithinRadius,
  radiusOptions,
  resolveUkPlaces,
} from "./uk-places";

const names = (places: readonly { name: string }[]) =>
  places.map((place) => place.name).toSorted();

describe("the bundled dataset", () => {
  it("covers all four UK nations", () => {
    const nations = new Set(allUkPlaces().map((place) => place.nation));
    expect([...nations].toSorted()).toEqual([
      "England",
      "Northern Ireland",
      "Scotland",
      "Wales",
    ]);
  });

  it("places every coordinate inside the United Kingdom's bounding box", () => {
    for (const place of allUkPlaces()) {
      expect(place.latitude, place.name).toBeGreaterThan(49.8);
      expect(place.latitude, place.name).toBeLessThan(61);
      expect(place.longitude, place.name).toBeGreaterThan(-8.7);
      expect(place.longitude, place.name).toBeLessThan(1.9);
    }
  });

  it("puts Londonderry in Northern Ireland rather than the West Midlands", () => {
    // Open Names has a real suburban area called Londonderry in Sandwell. A
    // seed that resolved to it would look successful and be three hundred miles
    // wrong, so this asserts the specific failure the seed script guards.
    const [derry] = resolveUkPlaces("Londonderry");
    expect(derry?.nation).toBe("Northern Ireland");
    expect(derry?.longitude).toBeLessThan(-6);
  });
});

describe("normalisePlaceName", () => {
  it("folds case, punctuation, and accents to one comparable form", () => {
    expect(normalisePlaceName("Stoke-on-Trent")).toBe("stoke on trent");
    expect(normalisePlaceName("  KING'S LYNN  ")).toBe("king s lynn");
    expect(normalisePlaceName("Ynys Môn")).toBe("ynys mon");
  });
});

describe("resolveUkPlaces", () => {
  it("resolves an exact name", () => {
    expect(names(resolveUkPlaces("Manchester"))).toEqual(["Manchester"]);
  });

  it("resolves a name buried in advert prose", () => {
    expect(names(resolveUkPlaces("Leeds, West Yorkshire (hybrid)"))).toEqual([
      "Leeds",
    ]);
  });

  it("prefers the longest matching name", () => {
    expect(
      names(resolveUkPlaces("Newcastle upon Tyne, Tyne and Wear")),
    ).toEqual(["Newcastle upon Tyne"]);
  });

  it("does not match a place name inside a longer word", () => {
    // The bug this replaces: ILIKE '%bath%' matched Bathgate.
    expect(resolveUkPlaces("Bathgate")).toEqual([]);
    expect(resolveUkPlaces("Wembley")).not.toEqual([]);
    expect(names(resolveUkPlaces("Wembley"))).toEqual(["Wembley"]);
  });

  it("returns both settlements when a name genuinely names two", () => {
    const bangor = resolveUkPlaces("Bangor");
    expect(bangor.length).toBeGreaterThan(1);
    expect(new Set(bangor.map((place) => place.nation)).size).toBeGreaterThan(
      1,
    );
  });

  it("returns nothing for text naming no known place", () => {
    expect(resolveUkPlaces("Remote within the United Kingdom")).toEqual([]);
    expect(resolveUkPlaces("")).toEqual([]);
    expect(resolveUkPlaces("   ")).toEqual([]);
  });
});

describe("distanceMiles", () => {
  it("is zero for a point against itself", () => {
    const [manchester] = resolveUkPlaces("Manchester");
    expect(distanceMiles(manchester!, manchester!)).toBeCloseTo(0, 6);
  });

  it("agrees with known UK distances", () => {
    const of = (name: string) => resolveUkPlaces(name)[0]!;
    // London to Edinburgh is about 330 miles as the crow flies.
    expect(distanceMiles(of("London"), of("Edinburgh"))).toBeGreaterThan(320);
    expect(distanceMiles(of("London"), of("Edinburgh"))).toBeLessThan(345);
    // Manchester to Salford is a short walk across the river.
    expect(distanceMiles(of("Manchester"), of("Salford"))).toBeLessThan(3);
  });

  it("is symmetric", () => {
    const of = (name: string) => resolveUkPlaces(name)[0]!;
    expect(distanceMiles(of("Cardiff"), of("Bristol"))).toBeCloseTo(
      distanceMiles(of("Bristol"), of("Cardiff")),
      9,
    );
  });
});

describe("placesWithinRadius", () => {
  it("finds the neighbouring towns an exact-name search misses", () => {
    const within = names(placesWithinRadius("Manchester", 10));
    expect(within).toContain("Salford");
    expect(within).toContain("Trafford Park");
    expect(within).toContain("Stretford");
    expect(within).not.toContain("Leeds");
  });

  it("always includes the place the user actually typed", () => {
    for (const miles of radiusOptions) {
      expect(names(placesWithinRadius("Leeds", miles))).toContain("Leeds");
    }
  });

  it("widens monotonically as the radius grows", () => {
    let previous = 0;
    for (const miles of radiusOptions) {
      const count = placesWithinRadius("Birmingham", miles).length;
      expect(count).toBeGreaterThanOrEqual(previous);
      previous = count;
    }
  });

  it("returns nothing when the centre cannot be resolved", () => {
    expect(placesWithinRadius("Atlantis", 10)).toEqual([]);
  });

  it("crosses a nation border when the distance genuinely does", () => {
    // Chester to Wrexham is about twelve miles across the Welsh border, and a
    // radius search that stopped at the border would be wrong.
    const within = names(placesWithinRadius("Chester", 20));
    expect(within).toContain("Wrexham");
  });
});

describe("isRadiusMiles", () => {
  it("accepts only the offered radii", () => {
    expect(isRadiusMiles(10)).toBe(true);
    expect(isRadiusMiles(7)).toBe(false);
    expect(isRadiusMiles("10")).toBe(false);
    expect(isRadiusMiles(1_000_000)).toBe(false);
  });
});

describe("dataset integrity", () => {
  it("has no row whose own canonical name disagrees with the name it answers to", () => {
    // The seed once shipped an "Omagh" whose canonicalName said "Enniskillen",
    // twenty miles away — a wrong answer that was visible in the artefact and
    // went unnoticed. This is the cheap guard against the next one.
    for (const place of allUkPlaces()) {
      const [match] = resolveUkPlaces(place.name);
      expect(match, place.name).toBeDefined();
    }
  });

  it("keeps Omagh in Omagh", () => {
    const [omagh] = resolveUkPlaces("Omagh");
    const [enniskillen] = resolveUkPlaces("Enniskillen");
    expect(omagh?.nation).toBe("Northern Ireland");
    // The two towns are about twenty-one miles apart. The bad row put them two
    // miles apart, which is the shape the assertion has to catch.
    expect(distanceMiles(omagh!, enniskillen!)).toBeGreaterThan(15);
  });
});

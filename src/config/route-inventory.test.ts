import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { ROUTE_INVENTORY } from "@/config/route-inventory";

const LOCALE_ROOT = join(process.cwd(), "src", "app", "[locale]");
const PROHIBITED_SURFACE_MARKERS = [
  "ModulePlaceholderPage",
  "Module coming soon",
  "Coming soon",
  "In development",
];

function pageFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? pageFiles(path) : entry.name === "page.tsx" ? [path] : [];
  });
}

function routeFor(file: string) {
  const directory = relative(LOCALE_ROOT, file.slice(0, -"page.tsx".length));
  const route = `/${directory.split(sep).filter(Boolean).join("/")}`;
  return route === "/" ? route : route.replace(/\/$/, "");
}

describe("deterministic live-route inventory", () => {
  const livePages = pageFiles(LOCALE_ROOT).filter((file) => !file.includes(`${sep}auth${sep}`));

  it("classifies every non-auth locale page exactly once", () => {
    const implemented = livePages.map(routeFor).sort();
    const inventoried = ROUTE_INVENTORY.map((entry) => entry.route).sort();
    expect(inventoried).toEqual(implemented);
    expect(new Set(inventoried).size).toBe(inventoried.length);
  });

  it("does not classify an incomplete surface as complete", () => {
    for (const entry of ROUTE_INVENTORY) {
      expect(entry.evidence.trim(), `${entry.route} needs evidence`).not.toBe("");
      if (entry.status === "functional_partial") {
        expect(entry.rationale?.trim(), `${entry.route} needs a rationale`).toBeTruthy();
      }
    }
  });

  it("rejects placeholder markers and missing server authorization", () => {
    for (const file of livePages) {
      const source = readFileSync(file, "utf8");
      for (const marker of PROHIBITED_SURFACE_MARKERS) {
        expect(source, `${routeFor(file)} contains ${marker}`).not.toContain(marker);
      }
      if (routeFor(file) !== "/") {
        expect(source, `${routeFor(file)} lacks the shared route boundary`).toContain(
          "requireRoutePermission",
        );
      }
    }
  });
});

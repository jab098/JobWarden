import "vitest";
import type { TestingLibraryMatchers } from "@testing-library/jest-dom/matchers";
import type { AxeMatchers } from "vitest-axe/matchers";

declare module "vitest" {
  interface Assertion<T>
    extends TestingLibraryMatchers<unknown, T>, AxeMatchers {}
  interface AsymmetricMatchersContaining
    extends TestingLibraryMatchers<unknown, unknown>, AxeMatchers {}
}

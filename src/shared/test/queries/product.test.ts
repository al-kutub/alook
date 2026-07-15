import { describe, it, expect, vi } from "vitest";
import * as productQueries from "../../src/db/queries/product";

function createMock({ existingRows = [] as any[], insertedRows = [] as any[] } = {}) {
  const chain: any = {};
  chain.select = vi.fn(() => chain);
  chain.from = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.orderBy = vi.fn(() => chain);
  chain.limit = vi.fn(() => Promise.resolve(existingRows));
  chain.insert = vi.fn(() => chain);
  chain.values = vi.fn(() => chain);
  chain.returning = vi.fn(() => Promise.resolve(insertedRows));
  return chain;
}

describe("product exports", () => {
  it("exports createProduct", () => { expect(typeof productQueries.createProduct).toBe("function"); });
  it("exports listProducts", () => { expect(typeof productQueries.listProducts).toBe("function"); });
  it("exports getOrCreateUnsortedProduct", () => { expect(typeof productQueries.getOrCreateUnsortedProduct).toBe("function"); });
});

describe("createProduct", () => {
  it("creates a new product when no active product with the same name exists", async () => {
    const created = { id: "prod_1", name: "LUMINA", status: "active" };
    const mockDb = createMock({ existingRows: [], insertedRows: [created] });

    const result = await productQueries.createProduct(mockDb, {
      workspaceId: "w",
      name: "LUMINA",
      description: "A game",
    });

    expect(mockDb.insert).toHaveBeenCalled();
    expect(mockDb.values).toHaveBeenCalledWith(
      expect.objectContaining({ name: "LUMINA", workspaceId: "w" })
    );
    expect(result).toEqual(created);
  });

  it("returns the existing active product instead of inserting a duplicate on exact-name match", async () => {
    const existing = { id: "prod_1", name: "LUMINA", status: "active" };
    const mockDb = createMock({ existingRows: [existing] });

    const result = await productQueries.createProduct(mockDb, {
      workspaceId: "w",
      name: "LUMINA",
      description: "A second, different description",
    });

    expect(mockDb.insert).not.toHaveBeenCalled();
    expect(result).toEqual(existing);
  });

  it("returns the existing active product on a case-insensitive name match", async () => {
    const existing = { id: "prod_1", name: "LUMINA", status: "active" };
    const mockDb = createMock({ existingRows: [existing] });

    const result = await productQueries.createProduct(mockDb, {
      workspaceId: "w",
      name: "lumina",
    });

    expect(mockDb.insert).not.toHaveBeenCalled();
    expect(result).toEqual(existing);
  });
});

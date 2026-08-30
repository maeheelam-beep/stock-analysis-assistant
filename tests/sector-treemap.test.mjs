import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

function layoutTreemap(weights, aspectRatio) {
  const nodes = weights
    .map((weight, rank) => ({ rank, weight }))
    .sort((a, b) => b.weight - a.weight || a.rank - b.rank);
  const rectangles = [];
  const canvasWidth = Math.min(240, Math.max(48, aspectRatio * 100));

  function layout(branch, x, y, width, height) {
    if (branch.length === 1) {
      rectangles.push({ ...branch[0], x, y, width, height });
      return;
    }
    const totalWeight = branch.reduce((sum, node) => sum + node.weight, 0);
    const targetWeight = totalWeight / 2;
    let firstWeight = 0;
    let splitIndex = 1;
    let smallestDifference = Number.POSITIVE_INFINITY;
    for (let index = 1; index < branch.length; index += 1) {
      firstWeight += branch[index - 1].weight;
      const difference = Math.abs(targetWeight - firstWeight);
      if (difference < smallestDifference) {
        smallestDifference = difference;
        splitIndex = index;
      }
    }
    const firstBranch = branch.slice(0, splitIndex);
    const secondBranch = branch.slice(splitIndex);
    const firstRatio = firstBranch.reduce((sum, node) => sum + node.weight, 0) / totalWeight;
    if (width >= height) {
      const firstWidth = width * firstRatio;
      layout(firstBranch, x, y, firstWidth, height);
      layout(secondBranch, x + firstWidth, y, width - firstWidth, height);
    } else {
      const firstHeight = height * firstRatio;
      layout(firstBranch, x, y, width, firstHeight);
      layout(secondBranch, x, y + firstHeight, width, height - firstHeight);
    }
  }

  layout(nodes, 0, 0, canvasWidth, 100);
  return rectangles;
}

test("sector treemap tiles cover the canvas without overlap", () => {
  const weights = Array.from({ length: 48 }, (_, index) => Math.sqrt((index + 2) * 1_000_000));
  for (const aspectRatio of [0.5, 16 / 9, 2.4]) {
    const rectangles = layoutTreemap(weights, aspectRatio);
    const canvasWidth = Math.min(240, Math.max(48, aspectRatio * 100));
    assert.equal(rectangles.length, weights.length);
    const area = rectangles.reduce((sum, rectangle) => sum + rectangle.width * rectangle.height, 0);
    assert.ok(Math.abs(area - canvasWidth * 100) < 0.001);
    rectangles.forEach((first, index) => {
      assert.ok(first.x >= 0 && first.y >= 0);
      assert.ok(first.x + first.width <= canvasWidth + 0.0001);
      assert.ok(first.y + first.height <= 100.0001);
      rectangles.slice(index + 1).forEach((second) => {
        const overlapWidth = Math.min(first.x + first.width, second.x + second.width) - Math.max(first.x, second.x);
        const overlapHeight = Math.min(first.y + first.height, second.y + second.height) - Math.max(first.y, second.y);
        assert.ok(overlapWidth <= 0.0001 || overlapHeight <= 0.0001);
      });
    });
  }
});

test("sector treemap implementation tracks the rendered canvas ratio", () => {
  assert.match(page, /function layoutSectorTreemap/);
  assert.match(page, /new ResizeObserver\(updateRatio\)/);
  assert.match(page, /Math\.min\(240, Math\.max\(48, aspectRatio \* 100\)\)/);
  assert.match(page, /layout\(sortedNodes, 0, 0, canvasWidth, canvasHeight\)/);
});
